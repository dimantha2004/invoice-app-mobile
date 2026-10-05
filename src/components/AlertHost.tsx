import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Text, View, type AlertButton } from 'react-native';
import { Btn, C, s } from './ui';

type Msg = { title: string; message?: string; buttons: AlertButton[] };
let push: ((m: Msg) => void) | null = null;

// react-native-web's Alert.alert is a no-op, so on web route it into an in-app dialog (phones keep the native one).
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => push?.({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
}

/** Renders Alert.alert calls on web. Mounted once in the root layout. */
export function AlertHost() {
  const [queue, setQueue] = useState<Msg[]>([]);
  useEffect(() => {
    push = m => setQueue(q => [...q, m]);
    return () => { push = null; };
  }, []);
  const cur = queue[0];
  const press = (b: AlertButton) => { setQueue(q => q.slice(1)); b.onPress?.(); };
  const cancel = cur?.buttons.find(b => b.style === 'cancel') ?? cur?.buttons[0];

  return (
    <Modal visible={!!cur} transparent animationType="fade" onRequestClose={() => cancel && press(cancel)}>
      <View style={s.dialogOverlay}>
        <View style={s.dialog}>
          <Text style={{ fontSize: 19, fontWeight: '700', color: C.primary, textAlign: 'center' }}>{cur?.title}</Text>
          {cur?.message ? <Text style={{ fontSize: 16, color: C.text, textAlign: 'center', marginTop: 10 }}>{cur.message}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 22 }}>
            {cur?.buttons.map((b, i) => (
              <Btn key={i} title={b.text ?? 'OK'} variant={b.style === 'cancel' ? 'outline' : 'primary'} onPress={() => press(b)} small
                style={{ width: 130, borderRadius: 10 }} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
