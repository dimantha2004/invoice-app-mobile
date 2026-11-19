import { useLocalSearchParams } from 'expo-router';
import { Fragment, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';
import { CustomerSheet, ItemPickerSheet, PaymentSheet } from '../components/sheets';
import { AddLink, Btn, ButtonRow, C, DateField, Field, ItemsBox, NotesBox, Screen, SelectField, TotalsCard } from '../components/ui';
import { useDocSave } from '../components/useDocSave';
import { useApi, type Customer, type Doc } from '../lib/api';
import { inactiveMsg } from '../lib/local';
import { FREE_TYPES, mergeLines, rs, today, totals, type FreeKind, type Line, type Payment } from '../lib/format';

/** "Create New Invoice", or `?draft=<order no>` to continue a saved draft (it is loaded first, then shown filled in). */
export default function InvoiceFormScreen() {
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  const d = useApi<Doc>(draft ? `/orders/${encodeURIComponent(draft)}` : null);
  if (draft && !d.data) {
    return (
      <Screen title="Edit Draft" tab="invoices">
        {d.error ? <Text style={{ color: C.danger, textAlign: 'center' }}>{d.error}</Text> : <ActivityIndicator color={C.primary} style={{ padding: 40 }} />}
      </Screen>
    );
  }
  return <InvoiceForm draft={d.data} />;
}

const toLine = ({ productId, code, name, unit, price, qty }: Line): Line => ({ productId, code, name, unit, price, qty });

/** Full "Create New Invoice" form (Invoice Items List). The invoice number is made on the phone from the rep's own range. */
function InvoiceForm({ draft }: { draft?: Doc }) {
  const customers = useApi<Customer[]>('/customers?q=');
  const next = useApi<{ number: string }>('/invoices/next-number');
  const { save, saving } = useDocSave();
  const dl = draft?.lines ?? [];
  const [customerId, setCustomerId] = useState(draft?.customerId != null ? String(draft.customerId) : '');
  const [start, setStart] = useState(draft?.date ?? today());
  const [end, setEnd] = useState(draft && draft.dueDate !== draft.date ? draft.dueDate : '');
  const [lines, setLines] = useState<Line[]>(dl.filter(l => !l.free).map(toLine));
  const [discount, setDiscount] = useState(draft?.discount ?? 0);
  const [tax, setTax] = useState(draft?.tax ?? 0);
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [free, setFree] = useState<Record<FreeKind, Line[]>>({
    sample: dl.filter(l => l.free === 'sample').map(toLine), exchange: dl.filter(l => l.free === 'exchange').map(toLine),
  });
  const [freePicking, setFreePicking] = useState<FreeKind | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const { subTotal, net } = totals(lines, discount, tax);

  const submit = (target: 'invoice' | 'draft', payment?: Payment) => {
    if (!customerId) return Alert.alert('Select a customer');
    const c = customers.data?.find(x => String(x.id) === customerId);
    if (c?.status === 'Inactive') return Alert.alert('Customer is inactive', inactiveMsg(c.name));
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
    }, draft?.number);
  };

  return (
    <Screen title={draft ? `Draft #${draft.number}` : 'Invoice Items List'} tab="invoices">
      <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{draft ? 'Continue Draft' : 'Create New Invoice'}</Text>
      <Field value={next.data ? `#${next.data.number}` : ''} placeholder="Invoice Number (auto-generated)" editable={false} style={{ color: '#555' }} />
      <SelectField placeholder={customers.loading ? 'Loading customers…' : customers.error ? 'Customers unavailable' : 'Customer'} value={customerId} onChange={setCustomerId}
        options={(customers.data ?? []).map(c => ({ label: `${c.name} (${c.code})${c.status === 'Inactive' ? ' · Inactive' : ''}`, value: String(c.id) }))} />
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
