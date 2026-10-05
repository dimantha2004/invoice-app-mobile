import express from 'express';
import sql from 'mssql';
import { createThrottle, md5Candidates, signToken, verifyToken } from './auth.js';
import { splitPayment } from './payment.js';

const env = process.env;
for (const k of ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'AUTH_SECRET']) {
  if (!env[k]) throw new Error(`Missing ${k} in server/.env (see .env.example)`);
}

// Where app-created POS invoices are booked. Invoice numbers follow the POS pattern INV{MAINLOC}{STATION}{0000001}.
const MAINLOC = env.MOBILE_MAINLOC ?? 'MB';
const STATION = Number(env.MOBILE_STATION ?? 1);
const LOCATION = env.MOBILE_LOCATION ?? 'BAR';
const DEFAULT_COMPANY = Number(env.DEFAULT_COMPANY_ID ?? 1);
// ponytail: sales.SalesOrders/SalesReturns are empty in this ERP so the StatusEnum meaning is assumed. Adjust if the ERP uses other values.
const ST = { draft: 1, submitted: 2, invoiced: 3 };

const pool = await new sql.ConnectionPool({
  server: env.DB_SERVER,
  port: env.DB_PORT ? Number(env.DB_PORT) : undefined,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: { encrypt: env.DB_ENCRYPT === 'true', trustServerCertificate: true, instanceName: env.DB_INSTANCE || undefined },
}).connect();

const app = express();
// Web build (expo start --web) calls from another origin; native apps ignore CORS.
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '200kb' }));

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = msg => { throw new HttpError(400, msg); };

/** Run a parameterised query. params: { name: value } (types inferred by mssql). */
async function q(text, params = {}, tx) {
  const r = (tx ? new sql.Request(tx) : pool.request());
  for (const [k, v] of Object.entries(params)) r.input(k, v);
  return (await r.query(text)).recordset ?? [];
}

async function inTx(fn) {
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const out = await fn(tx);
    // TEST_ROLLBACK=true: run every write fully, then roll it back (safe testing against the live ERP).
    if (env.TEST_ROLLBACK === 'true') throw new HttpError(299, `rolled back: ${JSON.stringify(out)}`);
    await tx.commit();
    return out;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}

/* ---------- validation helpers ---------- */

const str = (v, max, name, required = false) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) bad(`${name} is required`);
  if (s.length > max) bad(`${name} is too long (max ${max})`);
  return s;
};
const money = (v, name) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) bad(`Invalid ${name}`);
  return Math.round(n * 100) / 100;
};
const isoDate = (v, name, required = true) => {
  if (!v && !required) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) bad(`Invalid ${name}`);
  return v;
};

/** Validate client lines and re-price them from inv.Products (never trust client prices). */
async function priceLines(lines, tx, { keepPrice = false } = {}) {
  if (!Array.isArray(lines) || !lines.length) bad('Add at least one item');
  if (lines.length > 200) bad('Too many items');
  const qty = new Map();
  for (const l of lines) {
    const id = Number(l.productId), n = Number(l.qty);
    if (!Number.isInteger(id) || id <= 0) bad('Invalid product');
    if (!Number.isInteger(n) || n <= 0 || n > 100000) bad('Quantity must be a whole number above 0');
    qty.set(id, (qty.get(id) ?? 0) + n);
  }
  const rows = await q(`
    SELECT p.ProductId, p.ProductCode, p.ProductDescription, p.SellingPrice, p.LastCost, p.DefaultUnitOfMeasureId, u.UnitOfMeasure
    FROM inv.Products p LEFT JOIN inv.UnitOfMeasures u ON u.UnitOfMeasureId = p.DefaultUnitOfMeasureId
    WHERE p.ExpiryDate IS NULL AND p.ProductId IN (${[...qty.keys()].join(',')})`, {}, tx); // ids validated as integers above (DB is too old for STRING_SPLIT)
  if (rows.length !== qty.size) bad('One or more items are no longer available');
  return rows.map(p => {
    const orig = lines.find(l => Number(l.productId) === p.ProductId);
    const price = keepPrice ? Number(orig.price) : Number(p.SellingPrice);
    const n = qty.get(p.ProductId);
    return { ...p, qty: n, price, amount: Math.round(price * n * 100) / 100 };
  });
}

/**
 * Sold lines plus free issues (samples and exchanges). A free issue is an ordinary document line with price 0 and amount 0:
 * it adds nothing to the totals but, being a normal line, the ERP's stock update takes it out of stock like any other item.
 */
async function pricedLines(lines, free, tx, opts) {
  const out = await priceLines(lines, tx, opts);
  for (const kind of ['sample', 'exchange']) {
    const list = free?.[kind];
    if (list != null && !Array.isArray(list)) bad(`Invalid ${kind} items`);
    if (list?.length) out.push(...(await priceLines(list, tx)).map(l => ({ ...l, price: 0, amount: 0, free: kind })));
  }
  return out;
}
// ponytail: InvoiceDetails has no line-type column, so the free-issue kind lives in TranferID (1 sample, 2 exchange), which
// nothing in the ERP reads. Order lines keep it in Remarks. Give it a real column if the ERP ever starts using TranferID.
const FREE_ID = { sample: 1, exchange: 2 };
const FREE_SQL = (price, amount, isExchange) =>
  `CASE WHEN ${price} = 0 AND ${amount} = 0 THEN CASE WHEN ${isExchange} THEN 'exchange' ELSE 'sample' END END free`;

/* ---------- auth ---------- */

const throttle = createThrottle();

app.post('/login', async (req, res) => {
  const username = str(req.body?.username, 50, 'Username', true);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) bad('Password is required');
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (throttle.blocked(key)) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');

  const [h1, h2] = md5Candidates(password);
  const [u] = await q(`
    SELECT TOP 1 l.LoginId, l.Username, COALESCE(l.CompanyId, uc.CompanyId) CompanyId, u.DisplayName, uc.EmployeeId,
           COALESCE(NULLIF(LTRIM(RTRIM(e.NameWithInitials)), ''), NULLIF(LTRIM(RTRIM(e.FullName)), ''), u.DisplayName) RepName
    FROM adm.Logins l
    JOIN adm.Users u ON u.UserId = l.LoginId
    OUTER APPLY (SELECT TOP 1 EmployeeId, CompanyId FROM adm.UserCompanies WHERE UserId = u.UserId AND ExpiryDate IS NULL ORDER BY IsDefault DESC, EmployeeId DESC) uc
    LEFT JOIN hr.Employees e ON e.EmployeeId = uc.EmployeeId
    WHERE l.Username = @username AND LOWER(l.PasswordHash) IN (@h1, @h2)
      AND (l.ExpiryDate IS NULL OR l.ExpiryDate > GETDATE()) AND (u.ExpiryDate IS NULL OR u.ExpiryDate > GETDATE())
      AND NOT (ISNULL(l.LockoutEnabled, 0) = 1 AND l.LockoutEndDate > GETDATE())`,
  { username, h1, h2 });

  if (!u) {
    throttle.fail(key);
    throw new HttpError(401, 'Invalid username or password');
  }
  throttle.reset(key);
  const user = {
    userId: u.LoginId, username: u.Username, displayName: u.RepName, employeeId: u.EmployeeId ?? null,
    companyId: u.CompanyId ?? DEFAULT_COMPANY,
  };
  res.json({ token: signToken(user, env.AUTH_SECRET), user });
});

app.get('/health', async (_req, res) => {
  await q('SELECT 1 ok');
  res.json({ ok: true });
});

// Everything below requires a valid token.
app.use((req, _res, next) => {
  const user = verifyToken(req.get('authorization')?.replace(/^Bearer /, ''), env.AUTH_SECRET);
  if (!user) throw new HttpError(401, 'Session expired. Please log in again.');
  req.user = user;
  next();
});

/* ---------- customers (sales.Customers) ---------- */

const CUSTOMER_TYPES = { Retail: 1, Wholesale: 2, Supermarket: 3 };
const customerSelect = `
  SELECT c.CustomerId id, c.CustomerCode code, c.CustomerName name, c.ContactNumber phone, c.BillingAddress address,
         CASE WHEN c.ExpiryDate IS NULL OR c.ExpiryDate > GETDATE() THEN 'Active' ELSE 'Inactive' END status
  FROM sales.Customers c`;

app.get('/customers', async (req, res) => {
  const search = `%${str(req.query.q, 100, 'Search')}%`;
  res.json(await q(`${customerSelect} WHERE (c.CustomerName LIKE @search OR c.CustomerCode LIKE @search OR c.ContactNumber LIKE @search)
    ORDER BY c.CustomerName`, { search }));
});

app.get('/customers/next-code', async (_req, res) => res.json({ code: await nextCustomerCode() }));

async function nextCustomerCode(tx) {
  const [r] = await q(`SELECT MAX(CAST(SUBSTRING(CustomerCode, 6, 10) AS int)) n FROM sales.Customers WITH (UPDLOCK, HOLDLOCK)
    WHERE CustomerCode LIKE 'CUS-M[0-9][0-9][0-9][0-9][0-9]'`, {}, tx);
  return `CUS-M${String((r?.n ?? 0) + 1).padStart(5, '0')}`;
}

app.post('/customers', async (req, res) => {
  const b = req.body ?? {};
  const name = str(b.name, 255, 'Customer name', true);
  const phone = str(b.phone, 20, 'Contact number');
  if (phone && !/^\+?[0-9 ]{9,15}$/.test(phone)) bad('Invalid contact number');
  const address = [str(b.address1, 100, 'Address line 1'), str(b.address2, 100, 'Address line 2'), str(b.city, 50, 'City')].filter(Boolean).join(', ');
  const category = CUSTOMER_TYPES[b.type] ?? null;
  const inactive = b.status === 'Inactive';

  const created = await inTx(async tx => {
    const code = await nextCustomerCode(tx);
    const [r] = await q(`
      INSERT INTO sales.Customers (CompanyId, CustomerCode, CustomerName, CategoryEnum, BillingAddress, ShippingAddress, ContactNumber, CreationDate, CreatedUserId, ExpiryDate)
      OUTPUT INSERTED.CustomerId id
      VALUES (@companyId, @code, @name, @category, @address, @address, @phone, GETDATE(), @userId, CASE WHEN @inactive = 1 THEN GETDATE() END)`,
    { companyId: req.user.companyId, code, name, category, address: address || null, phone: phone || null, userId: req.user.userId, inactive }, tx);
    return (await q(`${customerSelect} WHERE c.CustomerId = @id`, { id: r.id }, tx))[0];
  });
  res.status(201).json(created);
});

/* ---------- products (inv.Products) ---------- */

app.get('/products', async (req, res) => {
  const search = `%${str(req.query.q, 100, 'Search')}%`;
  res.json(await q(`
    SELECT TOP 100 p.ProductId id, p.ProductCode code, p.ProductDescription name, CAST(p.SellingPrice AS float) price, ISNULL(u.UnitOfMeasure, 'Unit') unit
    FROM inv.Products p LEFT JOIN inv.UnitOfMeasures u ON u.UnitOfMeasureId = p.DefaultUnitOfMeasureId
    WHERE p.ExpiryDate IS NULL AND (p.ProductDescription LIKE @search OR p.ProductCode LIKE @search OR p.Barcode LIKE @search)
    ORDER BY p.ProductDescription`, { search }));
});

/* ---------- invoices (dbo.InvoiceHead / dbo.InvoiceDetails) ---------- */

// ponytail: InvoiceHead has no due-date column, so the due date is kept in CreditRemarks as "Due:yyyy-mm-dd".
const invoiceSelect = `
  SELECT h.InvoiceNo id, h.InvoiceNo number, 'invoice' kind,
         CASE WHEN h.Credit = 1 AND h.CreditAmt > 0 THEN 'pending' ELSE 'paid' END status,
         c.CustomerId customerId, h.Customer customerCode, COALESCE(c.CustomerName, NULLIF(h.Customer, ''), 'Cash Customer') customerName,
         c.BillingAddress customerAddress,
         COALESCE(NULLIF(LTRIM(RTRIM(e.NameWithInitials)), ''), e.FullName, h.CashierID) rep,
         CONVERT(char(10), h.InvDate, 23) date,
         CAST(h.Cash AS float) cash, CAST(h.Cheque AS float) cheque, CAST(h.BankCard AS float) online,
         CAST(CASE WHEN h.Credit = 1 THEN h.CreditAmt ELSE 0 END AS float) credit,
         COALESCE(CASE WHEN h.CreditRemarks LIKE 'Due:____-__-__%' THEN SUBSTRING(h.CreditRemarks, 5, 10) END, CONVERT(char(10), h.InvDate, 23)) dueDate,
         CAST(h.GrossAmount AS float) subTotal, CAST(h.Discount AS float) discount, CAST(h.TaxAmt AS float) tax, CAST(h.NetAmount AS float) net,
         ISNULL(NULLIF(LTRIM(RTRIM(h.Remarks)), '0'), '') notes, NULLIF(h.OrderCustomer, '') salesOrderNo
  FROM dbo.InvoiceHead h
  LEFT JOIN sales.Customers c ON c.CustomerCode = NULLIF(h.Customer, '')
  LEFT JOIN hr.Employees e ON h.Steward NOT LIKE '%[^0-9]%' AND h.Steward <> '' AND e.EmployeeId = CAST(h.Steward AS int)`;

const SORT_SQL = { newest: 'h.InvDate DESC, h.InvoiceNo DESC', oldest: 'h.InvDate ASC, h.InvoiceNo ASC', amount: 'h.NetAmount DESC' };

app.get('/invoices', async (req, res) => {
  const status = ['pending', 'paid'].includes(req.query.status) ? req.query.status : 'all';
  const sort = SORT_SQL[req.query.sort] ?? SORT_SQL.newest;
  const search = str(req.query.q, 100, 'Search');
  const date = req.query.date ? isoDate(req.query.date, 'date') : null;
  const where = [`h.Cancled = 'N'`];
  if (status === 'pending') where.push('h.Credit = 1 AND h.CreditAmt > 0');
  if (status === 'paid') where.push('NOT (h.Credit = 1 AND h.CreditAmt > 0)');
  if (search) where.push('(h.InvoiceNo LIKE @search OR c.CustomerName LIKE @search)');
  if (date) where.push('h.InvDate >= @date AND h.InvDate < DATEADD(day, 1, @date)');
  const params = { search: `%${search}%`, date };
  const [rows, [counts]] = await Promise.all([
    q(`SELECT * FROM (${invoiceSelect} WHERE ${where.join(' AND ')} ORDER BY ${sort} OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY) x`, params),
    q(`SELECT COUNT(*) count, CAST(ISNULL(SUM(h.NetAmount), 0) AS float) amount,
         CAST(ISNULL(SUM(h.Cash), 0) AS float) cash, CAST(ISNULL(SUM(h.Cheque), 0) AS float) cheque, CAST(ISNULL(SUM(h.BankCard), 0) AS float) online,
         CAST(ISNULL(SUM(CASE WHEN h.Credit = 1 THEN h.CreditAmt ELSE 0 END), 0) AS float) credit
       FROM dbo.InvoiceHead h
       LEFT JOIN sales.Customers c ON c.CustomerCode = NULLIF(h.Customer, '') WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({ rows, ...counts });
});

async function invoiceWithLines(no, tx) {
  const [inv] = await q(`${invoiceSelect} WHERE h.InvoiceNo = @no`, { no }, tx);
  if (!inv) throw new HttpError(404, 'Invoice not found');
  inv.lines = await q(`
    SELECT COALESCE(p.ProductId, 0) productId, d.MenuCode code, COALESCE(p.ProductDescription, d.MenuCode) name, ISNULL(u.UnitOfMeasure, 'Unit') unit,
           CAST(d.Price AS float) price, CAST(d.Qty AS float) qty, CAST(d.Amount AS float) amount, ${FREE_SQL('d.Price', 'd.Amount', 'd.TranferID = 2')}
    FROM dbo.InvoiceDetails d
    LEFT JOIN inv.Products p ON p.ProductCode = d.MenuCode
    LEFT JOIN inv.UnitOfMeasures u ON u.UnitOfMeasureId = p.DefaultUnitOfMeasureId
    WHERE d.InvoiceNo = @no ORDER BY d.ID`, { no }, tx);
  return inv;
}

app.get('/invoices/:no', async (req, res) => res.json(await invoiceWithLines(str(req.params.no, 14, 'Invoice'))));

/** Pay a pending invoice: split its credit balance across cash / cheque / online; whatever is left as credit keeps it pending. */
// ponytail: the payment is added to the invoice's own totals, so it counts on the invoice date in the daily summary.
// Book it in sales.CustomerPayments if payments must be reported on the day they are received.
app.post('/invoices/:no/pay', async (req, res) => {
  const no = str(req.params.no, 14, 'Invoice');
  await inTx(async tx => {
    const [h] = await q(`SELECT CAST(CASE WHEN Credit = 1 THEN CreditAmt ELSE 0 END AS float) due FROM dbo.InvoiceHead WITH (UPDLOCK, HOLDLOCK)
      WHERE InvoiceNo = @no AND Cancled = 'N'`, { no }, tx);
    if (!h) throw new HttpError(404, 'Invoice not found');
    if (h.due <= 0) bad('This invoice is already paid');
    const pay = splitPayment(req.body?.payment, h.due, bad);
    if (pay.credit >= h.due) bad('Enter the amount being paid');
    await q(`UPDATE dbo.InvoiceHead SET Cash = Cash + @cash, Cheque = Cheque + @cheque, BankCard = BankCard + @online,
        CardName = CASE WHEN @online > 0 THEN 'ONLINE' ELSE CardName END, CreditAmt = @credit, Credit = @isCredit
      WHERE InvoiceNo = @no`, { no, cash: pay.cash, cheque: pay.cheque, online: pay.online, credit: pay.credit, isCredit: pay.credit > 0 }, tx);
  });
  res.json(await invoiceWithLines(no));
});

async function nextInvoiceNo(tx) {
  const prefix = `INV${MAINLOC}${STATION}`;
  const [r] = await q(`SELECT MAX(InvoiceNo) last FROM dbo.InvoiceHead WITH (UPDLOCK, HOLDLOCK)
    WHERE InvoiceNo LIKE @like AND LEN(InvoiceNo) = @len`, { like: `${prefix}%`, len: prefix.length + 7 }, tx);
  const n = r?.last ? Number(r.last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(7, '0')}`;
}

async function customerById(id, tx) {
  if (!Number.isInteger(Number(id))) bad('Select a customer');
  const [c] = await q('SELECT CustomerId, CustomerCode, CustomerName, BillingAddress FROM sales.Customers WHERE CustomerId = @id', { id: Number(id) }, tx);
  if (!c) bad('Customer not found');
  return c;
}

/** Insert a POS invoice with its payment split. Used by "Create Invoice" and order conversion. */
async function insertInvoice(tx, user, { customer, date, dueDate, lines, discount, tax, notes, salesOrderNo, payment }) {
  const gross = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  if (discount > gross) bad('Discount cannot be more than the total');
  const net = Math.round((gross - discount + tax) * 100) / 100;
  const pay = splitPayment(payment, net, bad);
  const no = await nextInvoiceNo(tx);
  await q(`
    INSERT INTO dbo.InvoiceHead (InvoiceNo, MainLoc, Station, InvDate, InvTime, OrderDate, OrderType, CashierID, Steward, Customer, OrderCustomer,
      GrossAmount, Discount, TaxAmt, NetAmount, Cash, Cheque, BankCard, CardName, CreditAmt, Credit, Cancled, Location, Remarks, CreditRemarks)
    VALUES (@no, @mainLoc, @station, @date, GETDATE(), @date, 'MOBILE', @cashier, @steward, @customer, @salesOrderNo,
      @gross, @discount, @tax, @net, @cash, @cheque, @online, @cardName, @credit, @isCredit, 'N', @location, @notes, @due)`,
  {
    // ponytail: InvoiceHead has no transfer column, so online transfers use BankCard tagged CardName 'ONLINE'. Split it out if real card sales are added.
    cash: pay.cash, cheque: pay.cheque, online: pay.online, cardName: pay.online > 0 ? 'ONLINE' : 'XXX', credit: pay.credit, isCredit: pay.credit > 0,
    no, mainLoc: MAINLOC, station: STATION, date, cashier: user.username.slice(0, 10),
    steward: user.employeeId ? String(user.employeeId).slice(0, 5) : null, customer: customer.CustomerCode, salesOrderNo: salesOrderNo ?? null,
    gross, discount, tax, net, location: LOCATION, notes: notes || null, due: `Due:${dueDate ?? date}`,
  }, tx);
  for (const l of lines) {
    await q(`
      INSERT INTO dbo.InvoiceDetails (InvoiceNo, MenuCode, ItemCode, Qty, Price, Amount, Cost, DiscUnitVal, DiscTotVal, TableLocationCharge, MainLoc, StockLocation, DiscountedUnitVal, TranferID)
      VALUES (@no, @code, @code, @qty, @price, @amount, @cost, 0, 0, 0, @station, @station, @price, @free)`,
    { free: FREE_ID[l.free] ?? null, no, code: l.ProductCode, qty: l.qty, price: l.price, amount: l.amount, cost: Number(l.LastCost ?? 0), station: String(STATION) }, tx);
  }
  return no;
}

app.post('/invoices', async (req, res) => {
  const b = req.body ?? {};
  const date = isoDate(b.date, 'date');
  const dueDate = isoDate(b.dueDate, 'due date', false);
  if (dueDate && dueDate < date) bad('End date cannot be before start date');
  const no = await inTx(async tx => insertInvoice(tx, req.user, {
    customer: await customerById(b.customerId, tx), date, dueDate, lines: await pricedLines(b.lines, { sample: b.samples, exchange: b.exchanges }, tx),
    discount: money(b.discount, 'discount'), tax: money(b.tax, 'tax'), notes: str(b.notes, 1000, 'Notes'), payment: b.payment,
  }));
  res.status(201).json(await invoiceWithLines(no));
});

/* ---------- sales orders & drafts (sales.SalesOrders / SalesOrderLines) ---------- */

const orderSelect = `
  SELECT CAST(o.SalesOrderId AS varchar) id, o.DocNumber number, 'order' kind,
         CASE o.StatusEnum WHEN ${ST.draft} THEN 'draft' WHEN ${ST.invoiced} THEN 'paid' ELSE 'pending' END status,
         o.CustomerId customerId, c.CustomerCode customerCode, ISNULL(c.CustomerName, 'Unknown') customerName, COALESCE(o.BillingAddress, c.BillingAddress) customerAddress,
         COALESCE(NULLIF(LTRIM(RTRIM(e.NameWithInitials)), ''), e.FullName, '') rep,
         CONVERT(char(10), o.DocDate, 23) date, CONVERT(char(10), COALESCE(o.DeliveryDate, o.DocDate), 23) dueDate,
         CAST(ISNULL(o.GrossValueTotal, 0) AS float) subTotal, CAST(ISNULL(o.DocDiscValue, 0) AS float) discount,
         CAST(ISNULL(o.TaxValueTotal, 0) AS float) tax, CAST(ISNULL(o.FinalValue, 0) AS float) net, ISNULL(o.Remarks, '') notes, NULL salesOrderNo
  FROM sales.SalesOrders o
  LEFT JOIN sales.Customers c ON c.CustomerId = o.CustomerId
  LEFT JOIN hr.Employees e ON e.EmployeeId = o.SalesRepEmployeeId`;

app.get('/orders', async (req, res) => {
  const search = `%${str(req.query.q, 100, 'Search')}%`;
  const sort = { newest: 'o.DocDate DESC, o.SalesOrderId DESC', oldest: 'o.DocDate ASC, o.SalesOrderId ASC', amount: 'o.FinalValue DESC' }[req.query.sort] ?? 'o.DocDate DESC, o.SalesOrderId DESC';
  res.json(await q(`SELECT * FROM (${orderSelect} WHERE o.ExpiryDate IS NULL AND o.StatusEnum IN (${ST.draft}, ${ST.submitted})
    AND (o.DocNumber LIKE @search OR c.CustomerName LIKE @search) ORDER BY ${sort} OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY) x`, { search }));
});

async function orderWithLines(id, tx) {
  const [o] = await q(`${orderSelect} WHERE o.SalesOrderId = @id`, { id }, tx);
  if (!o) throw new HttpError(404, 'Order not found');
  o.lines = await q(`
    SELECT l.ProductId productId, p.ProductCode code, p.ProductDescription name, ISNULL(u.UnitOfMeasure, 'Unit') unit,
           CAST(l.Price AS float) price, l.Quantity qty, CAST(l.NetValue AS float) amount, ${FREE_SQL('l.Price', 'l.NetValue', `l.Remarks = 'exchange'`)}
    FROM sales.SalesOrderLines l JOIN inv.Products p ON p.ProductId = l.ProductId
    LEFT JOIN inv.UnitOfMeasures u ON u.UnitOfMeasureId = l.DocUnitOfMeasureId
    WHERE l.SalesOrderId = @id ORDER BY l.SalesOrderLineId`, { id }, tx);
  return o;
}

const orderId = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) bad('Invalid order'); return n; };
app.get('/orders/:id', async (req, res) => res.json(await orderWithLines(orderId(req.params.id))));

app.post('/orders', async (req, res) => {
  const b = req.body ?? {};
  const status = b.status === 'draft' ? ST.draft : ST.submitted;
  const date = isoDate(b.date, 'date');
  const dueDate = isoDate(b.dueDate, 'due date', false);
  if (dueDate && dueDate < date) bad('End date cannot be before start date');
  const discount = money(b.discount, 'discount'), tax = money(b.tax, 'tax'), notes = str(b.notes, 1000, 'Notes');

  const id = await inTx(async tx => {
    const customer = await customerById(b.customerId, tx);
    const lines = await pricedLines(b.lines, { sample: b.samples, exchange: b.exchanges }, tx);
    const gross = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    if (discount > gross) bad('Discount cannot be more than the total');
    const net = Math.round((gross - discount + tax) * 100) / 100;
    const [r] = await q(`SELECT MAX(CAST(SUBSTRING(DocNumber, 4, 10) AS int)) n FROM sales.SalesOrders WITH (UPDLOCK, HOLDLOCK)
      WHERE DocNumber LIKE 'MSO[0-9][0-9][0-9][0-9][0-9][0-9]'`, {}, tx);
    const docNumber = `MSO${String((r?.n ?? 0) + 1).padStart(6, '0')}`;
    const [o] = await q(`
      INSERT INTO sales.SalesOrders (CompanyId, DocNumber, DocDate, StatusEnum, CustomerId, BillingAddress, SalesRepEmployeeId, DeliveryDate,
        GrossValueTotal, LineDiscTotal, DocDiscValue, TaxValueTotal, NetValue, FinalValue, Remarks, CreationDate, SubmittedDate, CreatedUserId)
      OUTPUT INSERTED.SalesOrderId id
      VALUES (@companyId, @docNumber, @date, @status, @customerId, @address, @rep, @due, @gross, 0, @discount, @tax, @net, @net, @notes,
        GETDATE(), CASE WHEN @status = ${ST.submitted} THEN GETDATE() END, @userId)`,
    {
      companyId: req.user.companyId, docNumber, date, status, customerId: customer.CustomerId, address: customer.BillingAddress,
      rep: req.user.employeeId, due: dueDate ?? date, gross, discount, tax, net, notes: notes || null, userId: req.user.userId,
    }, tx);
    for (const l of lines) {
      await q(`
        INSERT INTO sales.SalesOrderLines (SalesOrderId, DocNumber, DocDate, StatusEnum, ProductId, BaseUnitOfMeasureId, DocUnitOfMeasureId,
          Quantity, QuantityInBase, BalanceQuantity, Price, DiscountPct, DiscountValue, GrossValue, TaxValue, NetValue, Remarks, CreationDate, CreatedUserId)
        VALUES (@id, @docNumber, @date, @status, @productId, @uom, @uom, @qty, @qty, @qty, @price, 0, 0, @amount, 0, @amount, @free, GETDATE(), @userId)`,
      { free: l.free ?? null, id: o.id, docNumber, date, status, productId: l.ProductId, uom: l.DefaultUnitOfMeasureId, qty: l.qty, price: l.price, amount: l.amount, userId: req.user.userId }, tx);
    }
    return o.id;
  });
  res.status(201).json(await orderWithLines(id));
});

/** Turn an order/draft into a POS invoice; the invoice keeps the order number in InvoiceHead.OrderCustomer. */
app.post('/orders/:id/invoice', async (req, res) => {
  const id = orderId(req.params.id);
  const no = await inTx(async tx => {
    const o = await orderWithLines(id, tx);
    if (o.status === 'paid') bad('This order is already invoiced');
    const today = new Date().toISOString().slice(0, 10);
    const no = await insertInvoice(tx, req.user, {
      customer: await customerById(o.customerId, tx), date: today, dueDate: o.dueDate > today ? o.dueDate : today,
      lines: await pricedLines(o.lines.filter(l => !l.free), { sample: o.lines.filter(l => l.free === 'sample'), exchange: o.lines.filter(l => l.free === 'exchange') }, tx, { keepPrice: true }), discount: o.discount, tax: o.tax, notes: o.notes, salesOrderNo: o.number, payment: req.body?.payment,
    });
    await q(`UPDATE sales.SalesOrders SET StatusEnum = ${ST.invoiced}, ModifiedUserId = @userId WHERE SalesOrderId = @id`, { id, userId: req.user.userId }, tx);
    await q(`UPDATE sales.SalesOrderLines SET StatusEnum = ${ST.invoiced}, BalanceQuantity = 0 WHERE SalesOrderId = @id`, { id }, tx);
    return no;
  });
  res.status(201).json(await invoiceWithLines(no));
});

/* ---------- dashboard ---------- */

app.get('/stats', async (_req, res) => {
  const [r] = await q(`
    SELECT (SELECT COUNT(*) FROM sales.SalesOrders WHERE ExpiryDate IS NULL AND StatusEnum IN (${ST.draft}, ${ST.submitted})) orders,
           (SELECT COUNT(*) FROM dbo.InvoiceHead WHERE Cancled = 'N' AND InvDate >= CAST(GETDATE() AS date)) invoices,
           (SELECT COUNT(*) FROM dbo.InvoiceHead WHERE Cancled = 'N' AND InvDate >= CAST(GETDATE() AS date) AND NOT (Credit = 1 AND CreditAmt > 0)) payments`);
  res.json(r);
});

/* ---------- returns (sales.SalesReturns / SalesReturnLines) ---------- */

app.get('/returns/next-number', async (_req, res) => {
  const [r] = await q(`SELECT MAX(CAST(SUBSTRING(DocNumber, 4, 10) AS int)) n FROM sales.SalesReturns WHERE DocNumber LIKE 'RTV[0-9][0-9][0-9][0-9][0-9][0-9]'`);
  res.json({ number: `RTV${String((r?.n ?? 0) + 1).padStart(6, '0')}` });
});

app.post('/returns', async (req, res) => {
  const b = req.body ?? {};
  const docNumber = str(b.number, 50, 'Return PO number', true).replace(/^#/, '');
  const date = isoDate(b.date, 'date');
  const reason = str(b.reason, 100, 'Reason', true);
  const city = str(b.city, 100, 'City', true);
  const tax = money(b.tax, 'tax');
  const notes = str(b.notes, 800, 'Notes');
  const status = b.status === 'draft' ? ST.draft : ST.submitted;

  await inTx(async tx => {
    const [dup] = await q('SELECT 1 x FROM sales.SalesReturns WITH (UPDLOCK, HOLDLOCK) WHERE DocNumber = @docNumber', { docNumber }, tx);
    if (dup) bad('Return PO number already exists');
    const lines = await priceLines(b.lines, tx);
    const gross = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const net = Math.round((gross + tax) * 100) / 100;
    const [r] = await q(`
      INSERT INTO sales.SalesReturns (CompanyId, DocNumber, DocDate, StatusEnum, CustomerAddress, GrossValueTotal, LineDiscTotal, DocDiscValue,
        TaxValueTotal, NetValue, FinalValue, Remarks, CreationDate, SubmittedDate, CreatedUserId)
      OUTPUT INSERTED.SalesReturnId id
      VALUES (@companyId, @docNumber, @date, @status, @city, @gross, 0, 0, @tax, @net, @net, @remarks, GETDATE(),
        CASE WHEN @status = ${ST.submitted} THEN GETDATE() END, @userId)`,
    { companyId: req.user.companyId, docNumber, date, status, city, gross, tax, net, remarks: `Reason: ${reason}${notes ? ` | ${notes}` : ''}`, userId: req.user.userId }, tx);
    for (const l of lines) {
      await q(`
        INSERT INTO sales.SalesReturnLines (SalesReturnId, StatusEnum, DocUnitOfMeasureId, ProductId, Quantity, QuantityInBase, Price, DiscountPct,
          DiscountValue, GrossValue, TaxValue, NetValue, Remarks, CreationDate, CreatedUserId)
        VALUES (@id, @status, @uom, @productId, @qty, @qty, @price, 0, 0, @amount, 0, @amount, @reason, GETDATE(), @userId)`,
      { id: r.id, status, uom: l.DefaultUnitOfMeasureId, productId: l.ProductId, qty: l.qty, price: l.price, amount: l.amount, reason, userId: req.user.userId }, tx);
    }
  });
  res.status(201).json({ ok: true, number: docNumber });
});

/* ---------- errors ---------- */

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Server error. Please try again.' });
});

const port = Number(env.PORT ?? 4000);
app.listen(port, '0.0.0.0', () => console.log(`Invoice API listening on http://0.0.0.0:${port}`));
