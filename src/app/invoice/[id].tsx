import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { InvoiceActions } from '../../components/InvoiceActions';
import { BADGE } from '../../components/InvoiceList';
import { C, Screen } from '../../components/ui';
import { useApi, type Doc } from '../../lib/api';
import { dmy, FREE_TYPES, freeNote, payLabel } from '../../lib/format';
import { COMPANY } from '../../lib/store';

export default function InvoiceDetail() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const isOrder = kind === 'order';
  const { data: d, error, reload } = useApi<Doc>(`/${isOrder ? 'orders' : 'invoices'}/${encodeURIComponent(id)}`);
  const title = isOrder ? 'Order' : 'Invoice';

  if (!d) {
    return (
      <Screen title={title} tab="invoices">
        {error ? <Text style={{ color: C.danger, textAlign: 'center' }}>{error}</Text> : <ActivityIndicator color={C.primary} style={{ padding: 40 }} />}
      </Screen>
    );
  }
  const b = BADGE[d.status];

  return (
    <Screen title={`${title} #${d.number}`} tab="invoices">
      <View style={st.paper}>
        <Text style={st.title}>{isOrder ? 'Sales Order' : 'Invoice'}</Text>
        <View style={st.top}>
          <Image source={require('../../../assets/images/logo.png')} style={{ width: 48, height: 48 }} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[st.small, st.blue]}>{COMPANY.name}</Text>
            {COMPANY.address.map(a => <Text key={a} style={st.small}>{a}</Text>)}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[st.small, st.blue]}>{title} #{d.number}</Text>
            <Text style={[st.small, { color: b.color, fontWeight: '700' }]}>{b.label}</Text>
          </View>
        </View>
        <View style={st.info}>
          <View style={{ flex: 1 }}>
            <Text style={st.b}>Customer Name</Text><Text style={st.small}>{d.customerName}</Text>
            <Text style={st.b}>Billing Address:</Text><Text style={st.small}>{d.customerAddress || '-'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.b}>Sales Representative</Text><Text style={st.small}>{d.rep || '-'}</Text>
            {[['Date:', dmy(d.date)], ['Due Date:', dmy(d.dueDate)], ...(d.salesOrderNo ? [['Sales Order:', d.salesOrderNo]] : [])].map(([k, v]) => (
              <Text key={k} style={st.small}><Text style={st.b}>{k}</Text>  {v}</Text>
            ))}
          </View>
        </View>
        <View style={[st.tr, { backgroundColor: '#DCE8FD' }]}>
          {['Item #', 'Item', 'Qty', 'Price', 'Total'].map((h, i) => <Text key={h} style={[st.td, st.b, i === 1 && { flex: 2 }, i > 2 && st.r]}>{h}</Text>)}
        </View>
        {(d.lines ?? []).filter(l => !l.free).map((l, i) => (
          <View key={`${l.code}-${i}`} style={st.tr}>
            <Text style={st.td}>{l.code}</Text>
            <Text style={[st.td, { flex: 2 }]} numberOfLines={2}>{l.name}</Text>
            <Text style={st.td}>{l.qty} {l.unit}</Text>
            <Text style={[st.td, st.r]}>{l.price.toFixed(2)}</Text>
            <Text style={[st.td, st.r]}>{l.amount.toFixed(2)}</Text>
          </View>
        ))}
        <View style={st.totals}>
          {[['Sub Total', `Rs.${d.subTotal.toFixed(2)}`], ['Discount', d.discount.toFixed(2)], ['Tax', d.tax.toFixed(2)]].map(([k, v]) => (
            <View key={k} style={st.totRow}><Text style={st.small}>{k}</Text><Text style={[st.small, st.b]}>{v}</Text></View>
          ))}
          <View style={[st.totRow, { borderTopWidth: 1, borderTopColor: '#EEE' }]}>
            <Text style={[st.small, st.blue]}>Total</Text><Text style={[st.small, st.blue]}>Rs.{d.net.toFixed(2)}</Text>
          </View>
          {payLabel(d) ? <View style={st.totRow}><Text style={st.small}>Payment</Text><Text style={[st.small, st.b]}>{payLabel(d)}</Text></View> : null}
          {d.credit ? <View style={st.totRow}><Text style={st.small}>Balance Due</Text><Text style={[st.small, st.b]}>Rs.{d.credit.toFixed(2)}</Text></View> : null}
        </View>
        {FREE_TYPES.map(([k, title]) => !!freeNote(d.lines, k) && (
          <Text key={k} style={[st.small, { marginHorizontal: 16, marginBottom: 12 }]}><Text style={st.b}>{title} (not charged)</Text>: {freeNote(d.lines, k)}</Text>
        ))}
        {!!d.notes && <Text style={[st.small, { marginHorizontal: 16, marginBottom: 16 }]}><Text style={st.b}>Notes</Text>: {d.notes}</Text>}
        <View style={{ height: 22, backgroundColor: C.primary, marginTop: 24 }} />
      </View>
      <InvoiceActions doc={d} onChanged={reload} />
    </Screen>
  );
}

const st = StyleSheet.create({
  paper: {
    borderRadius: 12, borderTopWidth: 4, borderTopColor: C.primary, backgroundColor: C.white, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  title: { textAlign: 'center', color: C.textBlue, fontWeight: '600', fontSize: 15, marginTop: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderBottomWidth: 1, borderBottomColor: C.textBlue },
  info: { flexDirection: 'row', padding: 16, gap: 12 },
  small: { fontSize: 11, color: C.text, lineHeight: 18 },
  b: { fontSize: 11, fontWeight: '700', color: C.text },
  blue: { color: C.textBlue, fontWeight: '700' },
  tr: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 7, gap: 4 },
  td: { flex: 1, fontSize: 10, color: C.text },
  r: { textAlign: 'right' },
  totals: {
    alignSelf: 'flex-end', width: 190, margin: 16, padding: 12, borderRadius: 12, backgroundColor: C.white,
    borderWidth: 1, borderColor: '#EEE', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
});
