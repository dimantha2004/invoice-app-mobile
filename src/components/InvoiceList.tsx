import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApi, useDebounced, type Doc, type DocStatus } from '../lib/api';
import { dmy, rs } from '../lib/format';
import { Btn, C, DateField, Header, MaterialCommunityIcons, SearchBar, Sheet, TabBar } from './ui';

const SORTS = { newest: 'Newest first', oldest: 'Oldest first', amount: 'Highest amount' } as const;
type Sort = keyof typeof SORTS;

export const BADGE: Record<DocStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: C.warning, bg: '#FFF4E0' },
  paid: { label: 'Paid', color: C.success, bg: '#E3F6E9' },
  draft: { label: 'Draft', color: C.muted, bg: '#F0F0F0' },
  returned: { label: 'Returned', color: C.textBlue, bg: '#E8EFFD' },
};
const KIND_LABEL = { invoice: 'Invoice', order: 'Order', return: 'Return' } as const;

export const openDoc = (d: Pick<Doc, 'id' | 'kind'>) => router.push({ pathname: '/invoice/[id]', params: { id: d.id, kind: d.kind } });

export function DocCard({ d }: { d: Doc }) {
  const b = BADGE[d.status];
  return (
    <Pressable style={st.card} onPress={() => openDoc(d)}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: C.textBlue, fontSize: 16 }}>{KIND_LABEL[d.kind]} #{d.number}</Text>
        <Text style={{ fontSize: 16, fontStyle: 'italic', color: C.text }} numberOfLines={1}>{d.customerName}</Text>
        <Text style={{ fontSize: 16, color: C.lightText }}>{dmy(d.date)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 20, color: C.text }}>{rs(d.net)}</Text>
        <View style={[st.badge, { borderColor: b.color, backgroundColor: b.bg }]}>
          <View style={[st.dot, { backgroundColor: b.color }]} />
          <Text style={{ color: b.color, fontSize: 14 }}>{b.label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Invoices tab (All / Pending / Paid) from dbo.InvoiceHead; "orders" mode lists sales orders and drafts, "returns" the rep's returns. */
export function InvoiceList({ title, mode = 'all', inTab = false }: { title: string; mode?: 'all' | 'orders' | 'paid' | 'returns'; inTab?: boolean }) {
  const [q, setQ] = useState('');
  const search = encodeURIComponent(useDebounced(q.trim()));
  const [tab, setTab] = useState<'all' | 'pending' | 'paid'>(mode === 'paid' ? 'paid' : 'all');
  const [sort, setSort] = useState<Sort>('newest');
  const [date, setDate] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const isList = mode === 'orders' || mode === 'returns'; // plain lists, no status tabs
  const filter = `q=${search}&sort=${sort}&date=${date}`;

  const docs = useApi<Doc[]>(isList ? `/${mode}?${filter}` : null);
  const invoices = useApi<{ rows: Doc[]; count: number }>(!isList ? `/invoices?status=${tab}&${filter}` : null);
  const res = isList ? docs : invoices;
  const list = isList ? docs.data ?? [] : invoices.data?.rows ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <Header title={title} />
      <View style={{ padding: 16, paddingBottom: 0, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${mode === 'orders' ? 'Orders' : mode === 'returns' ? 'Returns' : 'Invoices'}`} style={{ flex: 1 }} />
          <Pressable style={[st.filter, !!date && { backgroundColor: C.textBlue }]} onPress={() => setSortOpen(true)} accessibilityLabel="Filter and sort">
            <MaterialCommunityIcons name="filter-variant" size={28} color={C.white} />
          </Pressable>
        </View>
        {!!date && (
          <Pressable onPress={() => setDate('')} accessibilityRole="button">
            <Text style={{ color: C.textBlue, fontSize: 15 }}>Showing {dmy(date)} only · <Text style={{ fontWeight: '700' }}>Clear</Text></Text>
          </Pressable>
        )}
        {!isList && (
          <View style={{ flexDirection: 'row' }}>
            {(['all', 'pending', 'paid'] as const).map(t => (
              <Pressable key={t} onPress={() => setTab(t)} style={[st.tab, tab === t && { backgroundColor: C.primary }]} accessibilityRole="tab">
                <Text style={[st.tabText, tab === t && { color: C.white }]}>
                  {t === 'all' ? `All${tab === 'all' && invoices.data ? ` (${invoices.data.count})` : ''}` : t === 'pending' ? 'Pending' : 'Paid'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <FlatList
        data={list}
        keyExtractor={d => `${d.kind}-${d.id}`}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshing={false}
        onRefresh={res.reload}
        ListEmptyComponent={
          res.loading ? <ActivityIndicator color={C.primary} style={{ padding: 40 }} />
            : <Text style={{ textAlign: 'center', color: res.error ? C.danger : C.muted, padding: 40 }}>{res.error ?? 'Nothing found.'}</Text>
        }
        renderItem={({ item }) => <DocCard d={item} />}
      />
      {mode === 'returns' && (
        <View style={{ padding: 16, paddingTop: 0 }}>
          <Btn title="New Return" onPress={() => router.push('/return-form')} style={{ flexGrow: 0, flexBasis: 'auto' }} />
        </View>
      )}
      <Sheet visible={sortOpen} title="Filter" onClose={() => setSortOpen(false)}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 6 }}>Date</Text>
        <DateField placeholder="Any date" value={date} onChange={v => { setDate(v); setSortOpen(false); }} />
        {!!date && (
          <Pressable style={{ paddingVertical: 10 }} onPress={() => { setDate(''); setSortOpen(false); }}>
            <Text style={{ fontSize: 16, color: C.textBlue }}>Show all dates</Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginTop: 16 }}>Sort by</Text>
        {(Object.keys(SORTS) as Sort[]).map(k => (
          <Pressable key={k} style={{ paddingVertical: 14 }} onPress={() => { setSort(k); setSortOpen(false); }}>
            <Text style={{ fontSize: 16, color: k === sort ? C.textBlue : C.text, fontWeight: k === sort ? '700' : '400' }}>{SORTS[k]}</Text>
          </Pressable>
        ))}
      </Sheet>
      {!inTab && <TabBar active="invoices" />}
    </View>
  );
}

const st = StyleSheet.create({
  filter: { width: 64, height: 56, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  tab: { flex: 1, height: 44, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 18, fontWeight: '600', color: C.textBlue },
  card: { flexDirection: 'row', borderWidth: 1.5, borderColor: C.cardBorder, borderRadius: 12, padding: 16, paddingHorizontal: 20 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
