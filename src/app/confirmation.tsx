import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { InvoiceActions } from '../components/InvoiceActions';
import { openDoc } from '../components/InvoiceList';
import { C, Ionicons, Screen } from '../components/ui';
import { useApi, type Doc } from '../lib/api';
import { rs } from '../lib/format';

export default function Confirmation() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const isOrder = kind === 'order';
  const { data: doc, error, reload } = useApi<Doc>(`/${isOrder ? 'orders' : 'invoices'}/${encodeURIComponent(id)}`);
  const label = isOrder ? 'Order' : 'Invoice';

  return (
    <Screen title={`${label} Confirmation`} tab="invoices" contentStyle={{ flexGrow: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text style={{ fontSize: 22, color: C.text }}>{label} {doc?.status === 'draft' ? 'Saved' : 'Completed'}</Text>
        <Ionicons name="checkmark-circle" size={34} color={C.success} />
      </View>
      {!doc ? (
        error ? <Text style={{ color: C.danger, textAlign: 'center' }}>{error}</Text> : <ActivityIndicator color={C.primary} />
      ) : (
        <>
          <Pressable style={st.card} onPress={() => openDoc(doc)}>
            {[[`${label} #:`, doc.number], ['Customer:', doc.customerName], ['Amount:', rs(doc.net, 2)]].map(([k, v]) => (
              <View key={k} style={st.row}>
                <Text style={{ fontSize: 17, color: C.text }}>{k}</Text>
                <Text style={{ fontSize: 17, fontWeight: '700', color: C.textBlue, flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </Pressable>
          <View style={{ flex: 1 }} />
          <InvoiceActions doc={doc} onChanged={reload} />
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  card: {
    borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.white, paddingHorizontal: 28, paddingVertical: 20,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
});
