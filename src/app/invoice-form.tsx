import { Fragment, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { CustomerSheet, ItemPickerSheet, PaymentSheet } from '../components/sheets';
import { AddLink, Btn, ButtonRow, C, DateField, Field, ItemsBox, NotesBox, Screen, SelectField, TotalsCard } from '../components/ui';
import { useDocSave } from '../components/useDocSave';
import { useApi, type Customer } from '../lib/api';
import { FREE_TYPES, mergeLines, rs, today, totals, type FreeKind, type Line, type Payment } from '../lib/format';

/** Full "Create New Invoice" form (Invoice Items List). The invoice number is made on the phone from the rep's own range. */
export default function InvoiceForm() {
  const customers = useApi<Customer[]>('/customers?q=');
  const { save, saving } = useDocSave();
  const [customerId, setCustomerId] = useState('');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState('');
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [free, setFree] = useState<Record<FreeKind, Line[]>>({ sample: [], exchange: [] });
  const [freePicking, setFreePicking] = useState<FreeKind | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const { subTotal, net } = totals(lines, discount, tax);

  const submit = (target: 'invoice' | 'draft', payment?: Payment) => {
    if (!customerId) return Alert.alert('Select a customer');
    if (!start) return Alert.alert('Select the start date');
    if (end && end < start) return Alert.alert('End date cannot be before start date');
    if (!lines.length) return Alert.alert('Add at least one item');
    if (discount > subTotal) return Alert.alert('Discount cannot be more than the total');
    if (target === 'invoice' && !payment) return setPaying(true);
    save(target, {
      customerId: Number(customerId), date: start, dueDate: end || undefined, discount, tax, notes: notes.trim(), payment,
      lines: lines.map(l => ({ productId: l.productId, qty: l.qty })),
      samples: free.sample.map(l => ({ productId: l.productId, qty: l.qty })),
      exchanges: free.exchange.map(l => ({ productId: l.productId, qty: l.qty })),
    });
  };

  return (
    <Screen title="Invoice Items List" tab="invoices">
      <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>Create New Invoice</Text>
      <Field placeholder="Invoice Number (auto-generated)" editable={false} />
      <SelectField placeholder={customers.loading ? 'Loading customers…' : customers.error ? 'Customers unavailable' : 'Customer'} value={customerId} onChange={setCustomerId}
        options={(customers.data ?? []).filter(c => c.status !== 'Inactive').map(c => ({ label: `${c.name} (${c.code})`, value: String(c.id) }))} />
      <Pressable onPress={() => setAddingCustomer(true)} style={{ alignSelf: 'flex-end', marginTop: -6 }} hitSlop={8}>
        <Text style={{ color: C.textBlue, fontWeight: '700', fontSize: 15 }}>Add New Customer</Text>
      </Pressable>
      <DateField placeholder="Start Date" value={start} onChange={setStart} />
      <DateField placeholder="End Date" value={end} onChange={setEnd} />
      <ItemsBox lines={lines} onRemove={id => setLines(l => l.filter(x => x.productId !== id))} />
      <AddLink title="Add Items" onPress={() => setPicking(true)} />
      {FREE_TYPES.map(([k, title]) => (
        <Fragment key={k}>
          <ItemsBox free={title} lines={free[k]} onRemove={id => setFree(f => ({ ...f, [k]: f[k].filter(x => x.productId !== id) }))} />
          <AddLink title={`Add ${title}`} onPress={() => setFreePicking(k)} />
        </Fragment>
      ))}
      <TotalsCard net={rs(net, 2)} rows={[
        { label: lines.length ? 'Sub Total' : 'Total', value: rs(subTotal, 2) },
        { label: 'Discount', edit: { value: discount, onChange: setDiscount } },
        { label: 'Tax', edit: { value: tax, onChange: setTax } },
      ]} />
      <NotesBox value={notes} onChangeText={setNotes} />
      <ButtonRow>
        <Btn title="Save Draft" variant="outline" onPress={() => submit('draft')} />
        <Btn title={saving ? 'Saving…' : 'Create Invoice'} onPress={() => submit('invoice')} />
      </ButtonRow>
      <ItemPickerSheet visible={freePicking !== null} title={`Add ${FREE_TYPES.find(([k]) => k === freePicking)?.[1] ?? ''}`} onClose={() => setFreePicking(null)}
        onAdd={added => { const k = freePicking; if (k) setFree(f => ({ ...f, [k]: mergeLines(f[k], added) })); }} />
      <PaymentSheet visible={paying} net={net} onClose={() => setPaying(false)} onConfirm={p => { setPaying(false); submit('invoice', p); }} />
      <ItemPickerSheet visible={picking} title="Add Items" onClose={() => setPicking(false)} onAdd={added => setLines(l => mergeLines(l, added))} />
      <CustomerSheet visible={addingCustomer} onClose={() => setAddingCustomer(false)} onCreated={c => { customers.reload(); setCustomerId(String(c.id)); }} />
    </Screen>
  );
}
