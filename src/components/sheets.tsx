import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, useApi, useDebounced, type Customer, type Product } from '../lib/api';
import { PAY_TYPES, rs, type Line, type Payment } from '../lib/format';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from '../lib/store';
import { Btn, C, Field, SearchBar, SelectField, Sheet } from './ui';

/** "Add Items" / "Add Return Items" bottom sheet backed by inv.Products. Tapping a row or + selects it; - at qty 1 deselects. */
export function ItemPickerSheet({ visible, title, onClose, onAdd }: {
  visible: boolean; title: string; onClose: () => void; onAdd: (lines: Line[]) => void;
}) {
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const { data: list = [], loading, error } = useApi<Product[]>(visible ? `/products?q=${encodeURIComponent(search)}` : null);
  const [picked, setPicked] = useState<Record<number, { p: Product; qty: number }>>({});

  const close = () => { setPicked({}); setQ(''); onClose(); };
  const setQty = (p: Product, qty: number) =>
    setPicked(x => { const n = { ...x }; if (qty <= 0) delete n[p.id]; else n[p.id] = { p, qty }; return n; });

  const add = () => {
    const lines = Object.values(picked).map(({ p, qty }) => ({ productId: p.id, code: p.code, name: p.name, unit: p.unit, price: p.price, qty }));
    if (!lines.length) return Alert.alert('No items selected', 'Tap an item or press + to select it.');
    onAdd(lines);
    close();
  };

  return (
    <Sheet visible={visible} title={title} onClose={close}
      footer={<Btn title={`Add Item${Object.keys(picked).length > 1 ? 's' : ''}`} onPress={add} style={{ flexGrow: 0, flexBasis: 'auto', marginTop: 12 }} />}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search Items" style={{ marginBottom: 8 }} />
      {loading && !list.length && <ActivityIndicator color={C.primary} style={{ padding: 20 }} />}
      {error && <Text style={{ textAlign: 'center', color: C.danger, padding: 12 }}>{error}</Text>}
      {list.map(p => {
        const qty = picked[p.id]?.qty ?? 0;
        const on = qty > 0;
        return (
          <Pressable key={p.id} onPress={() => !on && setQty(p, 1)} style={[st.itemCard, on && { borderColor: C.textBlue, borderWidth: 1.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: C.text }} numberOfLines={2}>
                {p.code}   <Text style={{ color: C.textBlue, fontWeight: '700' }}>{p.name}</Text>
              </Text>
              <Text style={{ fontSize: 14, color: C.lightText, fontStyle: 'italic', marginTop: 4 }}>Rs.{p.price} ({p.unit})</Text>
            </View>
            <View style={st.stepper}>
              <Pressable style={st.stepBtn} onPress={() => setQty(p, qty - 1)} accessibilityLabel={`Decrease ${p.name}`}><Text style={st.stepText}>-</Text></Pressable>
              <Text style={st.qty}>{Math.max(qty, 1)}</Text>
              <Pressable style={st.stepBtn} onPress={() => setQty(p, qty + 1)} accessibilityLabel={`Increase ${p.name}`}><Text style={st.stepText}>+</Text></Pressable>
            </View>
            <Text style={{ fontSize: 16, color: C.text, width: 84, textAlign: 'right' }}>Rs. {p.price * Math.max(qty, 1)}</Text>
          </Pressable>
        );
      })}
      {!loading && !error && list.length === 0 && <Text style={{ textAlign: 'center', color: C.muted, padding: 20 }}>No items found.</Text>}
    </Sheet>
  );
}

const empty = { type: '', name: '', phone: '', address1: '', address2: '', city: '', status: 'Active' };

/** Add New Customer -> sales.Customers (on Sync). The code comes from this rep's own range, made on the phone. */
export function CustomerSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated?: (c: Customer) => void }) {
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { data: next } = useApi<{ code: string }>(visible ? '/customers/next-code' : null);
  const set = (k: keyof typeof empty) => (v: string) => setF(x => ({ ...x, [k]: v }));

  const submit = async () => {
    const name = f.name.trim(), phone = f.phone.trim();
    const missing = ([['Customer Type', f.type], ['Customer Name', name], ['Contact Number', phone], ['Billing Address Line 1', f.address1], ['City', f.city]] as const)
      .filter(([, v]) => !v.trim()).map(([label]) => `• ${label}`);
    if (missing.length) return Alert.alert('Please fill all required fields', missing.join('\n'));
    if (!/^\+?[0-9 ]{9,15}$/.test(phone)) return Alert.alert('Invalid contact number');
    setSaving(true);
    try {
      const c = await api<Customer>('/customers', { method: 'POST', body: { ...f, name, phone } });
      setF(empty);
      onCreated?.(c);
      onClose();
      Alert.alert('Customer added', `${c.name} (#${c.code}) was added successfully.`);
    } catch (e) {
      Alert.alert('Could not add customer', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} title="Add New Customer" onClose={onClose}
      footer={<Btn title={saving ? 'Saving…' : 'Add Customer'} onPress={saving ? () => {} : submit} style={{ flexGrow: 0, flexBasis: 'auto', marginTop: 16 }} />}>
      <SelectField placeholder="Customer Type *" value={f.type} options={CUSTOMER_TYPES} onChange={set('type')} />
      <Field value={next?.code ? `#${next.code}` : ''} placeholder="Customer Code (auto)" editable={false} style={{ color: '#555' }} />
      <Field placeholder="Customer Name *" value={f.name} onChangeText={set('name')} />
      <Field placeholder="Contact Number *" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field placeholder="Billing Address  Line 1 *" value={f.address1} onChangeText={set('address1')} />
      <Field placeholder="Billing Address  Line 2 (optional)" value={f.address2} onChangeText={set('address2')} />
      <Field placeholder="City *" value={f.city} onChangeText={set('city')} />
      <SelectField placeholder="Customer Status" value={f.status} options={CUSTOMER_STATUSES} onChange={set('status')} />
    </Sheet>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Asked before an invoice is created: split the total across cash / cheque / online transfer / credit.
 * With `settle` it pays off a pending invoice instead: `net` is the balance due and Credit is what stays unpaid.
 */
export function PaymentSheet({ visible, net, settle = false, onClose, onConfirm }: {
  visible: boolean; net: number; settle?: boolean; onClose: () => void; onConfirm: (p: Payment) => void;
}) {
  const [amt, setAmt] = useState<Partial<Record<keyof Payment, string>>>({});
  const num = (k: keyof Payment) => parseFloat(amt[k] ?? '') || 0;
  const left = round2(net - PAY_TYPES.reduce((s, [k]) => s + num(k), 0));
  const close = () => { setAmt({}); onClose(); };
  /** Tapping a payment type puts the remaining balance on it (so one tap = pay everything that way). */
  const fill = (k: keyof Payment) => setAmt(a => ({ ...a, [k]: String(Math.max(0, round2(num(k) + left))) }));

  const confirm = () => {
    if (left > 0.005) return Alert.alert('Payment incomplete', `${rs(left, 2)} is still not assigned to a payment type.`);
    if (left < -0.005) return Alert.alert('Payment too high', `The amounts are ${rs(-left, 2)} more than the ${settle ? 'balance due' : 'invoice total'}.`);
    if (settle && num('credit') >= net - 0.005) return Alert.alert('Nothing to pay', 'Enter the amount being paid by cash, cheque or online transfer.');
    const p = { cash: round2(num('cash')), cheque: round2(num('cheque')), online: round2(num('online')), credit: round2(num('credit')) };
    setAmt({});
    onConfirm(p);
  };

  return (
    <Sheet visible={visible} title="Payment" onClose={close}
      footer={<Btn title={settle ? 'Pay' : 'Create Invoice'} onPress={confirm} style={{ flexGrow: 0, flexBasis: 'auto', marginTop: 16 }} />}>
      <Text style={{ fontSize: 15, color: C.muted }}>Tap a payment type to pay the balance that way, or type amounts for a mix payment.</Text>
      {PAY_TYPES.map(([k, label]) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable style={[st.payType, num(k) > 0 && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => fill(k)} accessibilityRole="button">
            <Text style={{ fontSize: 16, fontWeight: '600', color: num(k) > 0 ? C.white : C.textBlue }}>{label}</Text>
          </Pressable>
          <Field value={amt[k] ?? ''} placeholder="0.00" keyboardType="numeric" accessibilityLabel={`${label} amount`}
            onChangeText={t => setAmt(a => ({ ...a, [k]: t.replace(/[^0-9.]/g, '') }))} style={{ width: 130, textAlign: 'right' }} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 17, color: C.text }}>{settle ? 'Balance Due' : 'Invoice Total'}</Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: C.text }}>{rs(net, 2)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 17, color: C.text }}>Balance to assign</Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: Math.abs(left) > 0.005 ? C.danger : C.success }}>{rs(left, 2)}</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '600', color: num('credit') > 0 ? C.warning : C.success }}>
        {num('credit') > 0 ? `Invoice will ${settle ? 'stay' : 'be'} Pending — ${rs(num('credit'), 2)} on credit.` : 'Invoice will be marked Paid.'}
      </Text>
    </Sheet>
  );
}

const st = StyleSheet.create({
  payType: { flex: 1, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: C.textBlue, alignItems: 'center', justifyContent: 'center' },
  itemCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.inputBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 6 },
  stepBtn: { width: 26, height: 30, borderWidth: 1, borderColor: '#EEE', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: C.text },
  qty: { fontSize: 18, minWidth: 28, textAlign: 'center', color: C.text },
});
