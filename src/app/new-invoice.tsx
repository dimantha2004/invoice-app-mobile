import { useLocalSearchParams } from 'expo-router';
import { Fragment, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ItemPickerSheet, PaymentSheet } from '../components/sheets';
import { AddLink, Btn, ButtonRow, C, ItemsBox, NotesBox, Screen, TotalsCard } from '../components/ui';
import { useDocSave } from '../components/useDocSave';
import { dmy, FREE_TYPES, mergeLines, rs, today, totals, type FreeKind, type Line, type Payment } from '../lib/format';
import { useStore } from '../lib/store';

/** Quick invoice/order for a customer chosen on "Select Customers". */
export default function NewInvoice() {
  const params = useLocalSearchParams<{ customerId: string; customerName: string; kind?: string }>();
  const kind = params.kind === 'order' ? 'order' : 'invoice';
  const store = useStore();
  const { save, saving } = useDocSave();
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [free, setFree] = useState<Record<FreeKind, Line[]>>({ sample: [], exchange: [] });
  const [freePicking, setFreePicking] = useState<FreeKind | null>(null);
  const date = today();
  const { subTotal, net } = totals(lines, discount);
  const label = kind === 'order' ? 'Order' : 'Invoice';

  const submit = (target: 'invoice' | 'order' | 'draft', payment?: Payment) => {
    if (!lines.length) return Alert.alert('Add at least one item');
    if (discount > subTotal) return Alert.alert('Discount cannot be more than the total');
    if (target === 'invoice' && !payment) return setPaying(true);
    save(target, {
      customerId: Number(params.customerId), date, discount, tax: 0, notes: notes.trim(), payment,
      lines: lines.map(l => ({ productId: l.productId, qty: l.qty })),
      samples: free.sample.map(l => ({ productId: l.productId, qty: l.qty })),
      exchanges: free.exchange.map(l => ({ productId: l.productId, qty: l.qty })),
    });
  };

  return (
    <Screen title={`New ${label}`} tab="invoices">
      <Text style={st.h}>Create {label}</Text>
      <View style={st.info}>
        {[['Customer Name', params.customerName ?? '-'], ['Rep Name', store.user?.displayName ?? '-'], ['Date', dmy(date)]].map(([k, v]) => (
          <View key={k} style={st.infoRow}>
            <Text style={st.infoKey}>{k}</Text>
            <Text style={st.infoVal} numberOfLines={1}>{v}</Text>
          </View>
        ))}
      </View>
      <ItemsBox lines={lines} onRemove={id => setLines(l => l.filter(x => x.productId !== id))} />
      <AddLink title="Add Items" onPress={() => setPicking(true)} />
      {FREE_TYPES.map(([k, title]) => (
        <Fragment key={k}>
          <ItemsBox free={title} lines={free[k]} onRemove={id => setFree(f => ({ ...f, [k]: f[k].filter(x => x.productId !== id) }))} />
          <AddLink title={`Add ${title}`} onPress={() => setFreePicking(k)} />
        </Fragment>
      ))}
      <View style={{ height: 24 }} />
      <TotalsCard rows={[{ label: 'Total', value: rs(subTotal, 2) }, { label: 'Discount', edit: { value: discount, onChange: setDiscount } }]} net={rs(net, 2)} />
      <NotesBox value={notes} onChangeText={setNotes} />
      {lines.length > 0 && (
        <ButtonRow>
          <Btn title="Save Draft" variant="outline" onPress={() => submit('draft')} />
          <Btn title={saving ? 'Saving…' : `Create ${label}`} onPress={() => submit(kind)} />
        </ButtonRow>
      )}
      <ItemPickerSheet visible={freePicking !== null} title={`Add ${FREE_TYPES.find(([k]) => k === freePicking)?.[1] ?? ''}`} onClose={() => setFreePicking(null)}
        onAdd={added => { const k = freePicking; if (k) setFree(f => ({ ...f, [k]: mergeLines(f[k], added) })); }} />
      <PaymentSheet visible={paying} net={net} onClose={() => setPaying(false)} onConfirm={p => { setPaying(false); submit('invoice', p); }} />
      <ItemPickerSheet visible={picking} title="Add Items" onClose={() => setPicking(false)} onAdd={added => setLines(l => mergeLines(l, added))} />
    </Screen>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 20, fontWeight: '600', color: C.text, marginTop: 4 },
  info: { backgroundColor: '#C9D9F9', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 12 },
  infoRow: { flexDirection: 'row', paddingVertical: 8 },
  infoKey: { width: 130, fontSize: 16, fontStyle: 'italic', color: C.text },
  infoVal: { flex: 1, fontSize: 16, color: C.text },
});
