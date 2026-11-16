import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApi, useDebounced, type Customer } from '../lib/api';
import { inactiveMsg } from '../lib/local';
import { CustomerSheet } from './sheets';
import { Btn, C, Header, Ionicons, MaterialCommunityIcons, SearchBar, TabBar } from './ui';

/** "Select Customers" screen (sales.Customers): pick one, choose Create Invoice / Create Order, continue. */
export function CustomerPicker({ title = 'Select Customers', inTab = false }: { title?: string; inTab?: boolean }) {
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const { data: list = [], loading, error, reload } = useApi<Customer[]>(`/customers?q=${encodeURIComponent(search)}`);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [kind, setKind] = useState<'invoice' | 'order'>('invoice');
  const [adding, setAdding] = useState(false);

  const next = () => {
    if (!selected) return Alert.alert('Select a customer first');
    if (selected.status === 'Inactive') return Alert.alert('Customer is inactive', inactiveMsg(selected.name));
    router.push({ pathname: '/new-invoice', params: { customerId: selected.id, customerName: selected.name, kind } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <Header title={title} />
      <View style={{ padding: 16, paddingBottom: 4 }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Search Customer" />
      </View>
      <FlatList
        data={list}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
        refreshing={false}
        onRefresh={reload}
        ListEmptyComponent={loading ? <ActivityIndicator color={C.primary} style={{ padding: 40 }} />
          : <Text style={{ textAlign: 'center', color: error ? C.danger : C.muted, padding: 40 }}>{error ?? 'No customers found.'}</Text>}
        renderItem={({ item: c }) => {
          const on = c.id === selected?.id;
          return (
            <View style={{ gap: 12 }}>
              <Pressable style={st.row} onPress={() => setSelected(on ? null : c)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <View style={st.avatar} />
                <View style={{ flex: 1, marginLeft: 20 }}>
                  <Text style={st.name} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{c.code}{c.status === 'Inactive' ? ' · Inactive' : ''}</Text>
                </View>
                <View style={[st.check, on && { backgroundColor: C.primary, borderColor: C.primary }]}>
                  {on && <Ionicons name="checkmark" size={24} color={C.white} />}
                </View>
              </Pressable>
              {on && (
                <View style={st.toggle}>
                  {(['invoice', 'order'] as const).map(k => {
                    const active = kind === k;
                    const color = active ? C.white : C.textBlue;
                    return (
                      <Pressable key={k} style={[st.toggleHalf, active && { backgroundColor: C.blue }]} onPress={() => setKind(k)}>
                        <MaterialCommunityIcons name={k === 'invoice' ? 'receipt-text-check-outline' : 'file-document-check-outline'} size={26} color={color} />
                        <Text style={{ color, fontSize: 17 }}>{k === 'invoice' ? 'Create Invoice' : 'Create Order'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        }}
      />
      <View style={{ flexDirection: 'row', gap: 16, padding: 16, paddingTop: 8 }}>
        <Btn title="Add New Customer" variant="outline" onPress={() => setAdding(true)} />
        <Btn title="Select Customer" onPress={next} />
      </View>
      <CustomerSheet visible={adding} onClose={() => setAdding(false)} onCreated={c => { setSelected(c); reload(); }} />
      {!inTab && <TabBar active="invoices" />}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 90, borderWidth: 1.5, borderColor: C.textBlue, borderRadius: 12, paddingHorizontal: 24 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#93B1F2' },
  name: { fontSize: 20, color: C.text },
  check: { width: 36, height: 36, borderWidth: 1.5, borderColor: '#DCE6FB', borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', height: 90, borderWidth: 1.5, borderColor: C.textBlue, borderRadius: 12, overflow: 'hidden' },
  toggleHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
});
