import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { ItemPickerSheet } from '../components/sheets';
import { AddLink, Btn, ButtonRow, C, DateField, Field, ItemsBox, NotesBox, Screen, SelectField, TotalsCard } from '../components/ui';
import { api, useApi, type Customer } from '../lib/api';
import { mergeLines, rs, today, totals, type Line } from '../lib/format';
import { CITIES, RETURN_REASONS } from '../lib/store';

/** New customer return (not linked to an invoice) -> sales.SalesReturns / SalesReturnLines. */
export default function ReturnForm() {
  const next = useApi<{ number: string }>('/returns/next-number');
  const customers = useApi<Customer[]>('/customers?q=');
  const [customerId, setCustomerId] = useState('');
  const [typed, setNumber] = useState('');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [city, setCity] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState('');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const { subTotal, net } = totals(lines, 0, tax);

  const number = typed || next.data?.number || ''; // empty field falls back to the suggested number

  const save = async (status: 'draft' | 'created') => {
    const num = number.trim().replace(/^#/, '');
    if (!num) return Alert.alert('Return PO number is required');
    if (!customerId) return Alert.alert('Select a customer');
    if (!date) return Alert.alert('Select the return date');
    if (!reason) return Alert.alert('Select a reason for return');
    if (!city) return Alert.alert('Select a city');
    if (!lines.length) return Alert.alert('Add at least one return item');
    if (saving) return;
    setSaving(true);
    try {
      await api('/returns', {
        method: 'POST',
        body: { number: num, customerId: Number(customerId), status, date, reason, city, tax, notes: notes.trim(), lines: lines.map(l => ({ productId: l.productId, qty: l.qty })) },
      });
      Alert.alert(status === 'draft' ? 'Draft saved' : 'Return created', `Return ${num} ${status === 'draft' ? 'saved as draft' : 'created'}.`);
      router.back();
    } catch (e) {
      Alert.alert('Could not save return', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Return Items" tab="home">
      <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>New Return</Text>
      <Field placeholder="Return PO Number" value={number ? `#${number.replace(/^#/, '')}` : ''} onChangeText={t => setNumber(t.replace(/^#/, ''))} autoCapitalize="characters" />
      <SelectField placeholder={customers.loading ? 'Loading customers…' : customers.error ? 'Customers unavailable' : 'Customer'} value={customerId} onChange={setCustomerId}
        options={(customers.data ?? []).map(c => ({ label: `${c.name} (${c.code})`, value: String(c.id) }))} />
      <DateField placeholder="Date" value={date} onChange={setDate} />
      <SelectField placeholder="Reasons for Return" value={reason} options={RETURN_REASONS} onChange={setReason} />
      <SelectField placeholder="City" value={city} options={CITIES} onChange={setCity} />
      <ItemsBox lines={lines} onRemove={id => setLines(l => l.filter(x => x.productId !== id))} />
      <AddLink title="Add Return Items" onPress={() => setPicking(true)} />
      <TotalsCard net={rs(net, 2)} rows={[
        { label: 'Total Items', value: String(lines.length) },
        { label: 'Total', value: rs(subTotal, 2) },
        { label: 'Tax', edit: { value: tax, onChange: setTax } },
      ]} />
      <NotesBox value={notes} onChangeText={setNotes} />
      <ButtonRow>
        <Btn title="Save Draft" variant="outline" onPress={() => save('draft')} />
        <Btn title={saving ? 'Saving…' : 'Create Return'} onPress={() => save('created')} />
      </ButtonRow>
      <ItemPickerSheet visible={picking} title="Add Return Items" onClose={() => setPicking(false)} onAdd={added => setLines(l => mergeLines(l, added))} />
    </Screen>
  );
}
