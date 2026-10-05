import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Ionicons, MaterialCommunityIcons, useDarkStatusBar } from '../../components/ui';
import { useApi } from '../../lib/api';
import { useStore } from '../../lib/store';

function StatCard({ title, count, icon, style, dark, onPress }: {
  title: string; count: number; icon: string; style: ViewStyle; dark?: boolean; onPress: () => void;
}) {
  const color = dark ? C.textBlue : C.white;
  return (
    <Pressable style={[st.stat, style]} onPress={onPress}>
      <View style={[st.circle, { right: 50, top: 2 }]} />
      <View style={[st.circle, { right: 0, top: 30 }]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialCommunityIcons name={icon as any} size={24} color={color} />
        <Text style={[st.statTitle, { color }]}>{title}</Text>
      </View>
      <Text style={[st.statCount, { color }]}>{count}</Text>
    </Pressable>
  );
}

function MenuRow({ title, icon, href }: { title: string; icon: ReactNode; href: Href }) {
  return (
    <Pressable style={st.menu} onPress={() => router.push(href)} accessibilityRole="button">
      <View style={{ width: 50, alignItems: 'center' }}>{icon}</View>
      <Text style={st.menuText}>{title}</Text>
      <Ionicons name="chevron-forward" size={26} color={C.textBlue} />
    </Pressable>
  );
}

export default function Home() {
  useDarkStatusBar();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const stats = useApi<{ orders: number; invoices: number; payments: number }>('/stats');
  const s = stats.data ?? { orders: 0, invoices: 0, payments: 0 };

  return (
    <View style={{ flex: 1, backgroundColor: C.white, paddingTop: insets.top }}>
      <View style={st.header}>
        <Pressable onPress={() => router.navigate('/settings')} hitSlop={10} accessibilityLabel="Menu">
          <Ionicons name="menu" size={32} color={C.primary} />
        </Pressable>
        <Text style={st.title}>Home</Text>
        <Pressable style={st.sync} onPress={async () => { await stats.reload(); Alert.alert('Sync', 'Refreshed from the server.'); }}>
          <Ionicons name="sync" size={20} color={C.white} />
          <Text style={{ color: C.white, fontSize: 18, fontWeight: '500' }}>Sync</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12 }}>
        <Text style={{ color: C.muted, fontSize: 14 }}>
          Sales Representative: <Text style={{ color: C.textBlue, fontWeight: '700' }}>{store.user?.displayName}</Text>
          {stats.error ? <Text style={{ color: C.danger }}>{'  ·  ' + stats.error}</Text> : null}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCard title="Orders" count={s.orders} icon="file-document-check-outline" style={{ backgroundColor: '#3F82FF' }} onPress={() => router.push('/orders')} />
          <StatCard title="Invoices" count={s.invoices} icon="receipt-text-check-outline" style={{ backgroundColor: '#C9D9F9' }} dark onPress={() => router.navigate('/invoices')} />
        </View>
        <StatCard title="Payments" count={s.payments} icon="cash-multiple" style={{ backgroundColor: '#5C8DEE', alignItems: 'center', paddingRight: 60 }} onPress={() => router.push('/payments')} />
        <Pressable style={st.summary} onPress={() => router.push('/summary')}>
          <MaterialCommunityIcons name="finance" size={34} color={C.white} />
          <Text style={{ color: C.white, fontSize: 22, fontWeight: '600' }}>Daily Invoice Summary</Text>
        </Pressable>
        <MenuRow title="Customers" href="/select-customer" icon={<Ionicons name="person" size={28} color={C.primary} />} />
        <MenuRow title="New Invoice" href="/invoice-form" icon={<MaterialCommunityIcons name="receipt-text-check-outline" size={30} color={C.primary} />} />
        <MenuRow title="Payments" href="/payments" icon={<MaterialCommunityIcons name="cash-multiple" size={30} color={C.primary} />} />
        <MenuRow title="Orders/ Draft" href="/orders" icon={<MaterialCommunityIcons name="file-document-check-outline" size={30} color={C.primary} />} />
        <MenuRow title="Reports" href="/summary" icon={<MaterialCommunityIcons name="clipboard-text-outline" size={30} color={C.primary} />} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  title: { flex: 1, fontSize: 24, fontWeight: '700', color: C.primary, marginLeft: 22 },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  stat: { flex: 1, height: 116, borderRadius: 10, padding: 18, overflow: 'hidden' },
  circle: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(40,100,230,0.25)' },
  statTitle: { fontSize: 20, fontWeight: '600' },
  statCount: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  summary: { height: 116, borderRadius: 10, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  menu: { flexDirection: 'row', alignItems: 'center', height: 88, borderWidth: 1.5, borderColor: C.textBlue, borderRadius: 12, paddingHorizontal: 16 },
  menuText: { flex: 1, fontSize: 20, fontWeight: '500', color: C.textBlue, marginLeft: 20 },
});
