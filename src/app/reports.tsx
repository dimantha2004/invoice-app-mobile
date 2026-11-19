import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { C, DateField, Screen } from '../components/ui';
import { useApi } from '../lib/api';
import { PAY_TYPES, rs, today, type Payment } from '../lib/format';

type Report = Payment & {
  count: number; amount: number; discount: number; tax: number;
  items: { code: string; name: string; unit: string; qty: number; amount: number }[];
};

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return <View style={st.row}><Text style={st.label}>{label}</Text><Text style={[st.value, color ? { color } : null]}>{value}</Text></View>;
}

/** Sales report for a date range: totals, payment types and item-wise sales, from the invoices on this phone. */
export default function Reports() {
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const { data: r, error, loading } = useApi<Report>(`/reports?from=${from}&to=${to}`);

  return (
    <Screen title="Reports" tab="home">
      <Text style={st.h}>Sales Report</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><DateField placeholder="From" value={from} onChange={setFrom} /></View>
        <View style={{ flex: 1 }}><DateField placeholder="To" value={to} onChange={setTo} /></View>
      </View>
      {error ? <Text style={{ color: C.danger, textAlign: 'center' }}>{error}</Text>
        : !r ? (loading && <ActivityIndicator color={C.primary} style={{ padding: 40 }} />)
        : (
          <>
            <View style={st.card}>
              <Row label="Invoices" value={String(r.count)} />
              <Row label="Discount" value={rs(r.discount, 2)} />
              <Row label="Tax" value={rs(r.tax, 2)} />
              <Row label="Net Sales" value={rs(r.amount, 2)} color={C.textBlue} />
            </View>
            <View style={st.card}>
              {PAY_TYPES.map(([k, label]) => <Row key={k} label={label} value={rs(r[k], 2)} color={k === 'credit' ? C.warning : undefined} />)}
            </View>
            <Text style={st.h}>Item-wise Sales</Text>
            <View style={st.card}>
              {r.items.length === 0 && <Text style={{ color: C.muted, textAlign: 'center' }}>No sales in this period.</Text>}
              {r.items.map(i => (
                <View key={i.code} style={st.row}>
                  <Text style={[st.label, { flex: 1 }]} numberOfLines={2}>{i.code}  {i.name}</Text>
                  <Text style={[st.label, { width: 80, textAlign: 'right' }]}>{i.qty} {i.unit}</Text>
                  <Text style={[st.value, { width: 100, textAlign: 'right' }]}>{rs(i.amount, 2)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      <Text style={{ color: C.muted, fontSize: 13 }}>Based on the invoices on this phone (the last 60 days, refreshed on Sync).</Text>
    </Screen>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 20, fontWeight: '600', color: C.text },
  card: { borderWidth: 1.5, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 6 },
  label: { fontSize: 15, color: C.text },
  value: { fontSize: 16, fontWeight: '700', color: C.text },
});
