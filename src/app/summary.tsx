import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BADGE, openDoc } from '../components/InvoiceList';
import { C, DateField, Header, SearchBar, TabBar } from '../components/ui';
import { useApi, useDebounced, type Doc } from '../lib/api';
import { dayCard, dmy, PAY_TYPES, payLabel, rs, rsSpaced, today, type Payment } from '../lib/format';

export default function DailySummary() {
  const [q, setQ] = useState('');
  const search = encodeURIComponent(useDebounced(q.trim()));
  const [date, setDate] = useState('');
  const day = date || today();
  const { data, loading, error, reload } = useApi<{ rows: Doc[]; count: number; amount: number } & Partial<Payment>>(`/invoices?date=${day}&q=${search}&sort=newest`);

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <Header title="Daily Invoice Summary" />
      <FlatList
        data={data?.rows ?? []}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshing={false}
        onRefresh={reload}
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 6 }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search Customer" />
            <DateField placeholder="Select Date" value={date} onChange={setDate} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={st.stat}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBlue }}>{day === today() ? 'Today' : 'Date'}</Text>
                <Text style={{ fontSize: 15, color: C.textBlue, marginTop: 6 }}>{dayCard(day)}</Text>
              </View>
              <View style={[st.stat, { alignItems: 'center' }]}>
                <Text style={st.statLabel}>Total Invoices</Text>
                <Text style={st.statValue}>{data?.count ?? 0}  <Text style={{ fontSize: 16 }}>Invoices</Text></Text>
              </View>
              <View style={[st.stat, { alignItems: 'center' }]}>
                <Text style={st.statLabel}>Total Amount</Text>
                <Text style={[st.statValue, { fontSize: 18 }]} adjustsFontSizeToFit numberOfLines={1}>{rsSpaced(data?.amount ?? 0)}</Text>
              </View>
            </View>
            {/* Mix payments are counted under each of their parts, so these four add up to Total Amount. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {PAY_TYPES.map(([k, label]) => (
                <View key={k} style={[st.stat, st.pay, k === 'credit' && { borderLeftColor: C.warning }]}>
                  <Text style={st.statLabel}>{label}</Text>
                  <Text style={[st.statValue, { fontSize: 18, marginTop: 4 }, k === 'credit' && { color: C.warning }]} adjustsFontSizeToFit numberOfLines={1}>{rsSpaced(data?.[k] ?? 0)}</Text>
                </View>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={loading ? <ActivityIndicator color={C.primary} style={{ padding: 40 }} />
          : <Text style={{ textAlign: 'center', color: error ? C.danger : C.muted, padding: 40 }}>{error ?? `No invoices for ${dmy(day)}.`}</Text>}
        renderItem={({ item: i }) => (
          <Pressable style={st.card} onPress={() => openDoc(i)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.textBlue, flex: 1 }} numberOfLines={1}>{i.customerName}</Text>
              <Text style={{ fontSize: 15, color: C.lightText }}>Invoice #{i.number}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
              <View style={{ width: '34%' }}>
                <Text style={st.muted}>Invoiced</Text>
                <Text style={st.big}>{i.date === today() ? 'Today' : dmy(i.date)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.muted}>Due Date</Text>
                <Text style={st.big}>{dmy(i.dueDate)}</Text>
              </View>
              <Text style={{ fontSize: 20, color: C.text }}>{rs(i.net)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
              <Text style={[st.muted, { flex: 1 }]} numberOfLines={1}>{payLabel(i) || '-'}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: BADGE[i.status].color }}>{BADGE[i.status].label}</Text>
            </View>
          </Pressable>
        )}
      />
      <TabBar active="invoices" />
    </View>
  );
}

const st = StyleSheet.create({
  stat: {
    flex: 1, height: 116, borderRadius: 12, backgroundColor: C.white, padding: 12, justifyContent: 'center',
    borderWidth: 1, borderColor: '#DCE6FB', borderLeftWidth: 2.5, borderLeftColor: C.textBlue,
    shadowColor: C.textBlue, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
  },
  pay: { flexBasis: '45%', height: 76 },
  statLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  statValue: { fontSize: 20, fontWeight: '700', color: C.textBlue, marginTop: 8 },
  card: { borderWidth: 1.5, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14 },
  muted: { fontSize: 15, color: C.muted },
  big: { fontSize: 17, color: C.text, marginTop: 2 },
});
