import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, Ionicons, Screen } from '../../components/ui';
import { API_URL } from '../../lib/api';
import { COMPANY, useStore } from '../../lib/store';

function Row({ icon, title, onPress, danger }: { icon: 'return-down-back-outline' | 'document-text-outline' | 'log-out-outline'; title: string; onPress: () => void; danger?: boolean }) {
  const color = danger ? C.danger : C.textBlue;
  return (
    <Pressable style={[st.row, { borderColor: color }]} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={26} color={color} />
      <Text style={[st.rowText, { color }]}>{title}</Text>
      <Ionicons name="chevron-forward" size={24} color={color} />
    </Pressable>
  );
}

export default function Settings() {
  const store = useStore();
  return (
    <Screen title="Settings" back={false}>
      <View style={st.card}>
        <Text style={{ fontSize: 14, color: C.muted }}>Sales Representative</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.text }}>{store.user?.displayName}</Text>
        <Text style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>Username: {store.user?.username}</Text>
        <Text style={{ fontSize: 15, color: C.textBlue, marginTop: 8 }}>{COMPANY.name}</Text>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Server: {API_URL || 'not configured'}</Text>
      </View>
      <Row icon="document-text-outline" title="Orders / Draft" onPress={() => router.push('/orders')} />
      <Row icon="return-down-back-outline" title="Return Items" onPress={() => router.push('/returns')} />
      <Row icon="log-out-outline" title="Logout" danger onPress={() => { store.logout(); router.replace('/'); }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.inputBg, borderRadius: 12, padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', height: 72, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 20, gap: 16 },
  rowText: { flex: 1, fontSize: 18, fontWeight: '500' },
});
