import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Btn, C, Field, useDarkStatusBar } from '../components/ui';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

export default function Login() {
  useDarkStatusBar();
  const store = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  const ping = useCallback(() => api('/health').then(() => setOnline(true), () => setOnline(false)), []);
  useEffect(() => { ping(); }, [ping]);

  if (!store.ready) return <View style={[st.root, { justifyContent: 'center' }]}><ActivityIndicator color={C.white} /></View>;
  if (store.user) return <Redirect href="/home" />;

  const login = async () => {
    if (busy) return;
    if (!username.trim() || !password) return Alert.alert('Login', 'Please enter your username and password.');
    setBusy(true);
    try {
      await store.login(username.trim(), password);
      setPassword('');
      router.replace('/home');
    } catch (e) {
      Alert.alert('Login failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sync = async () => {
    await ping();
    Alert.alert('Sync', 'Log in, then tap Sync on Home. Work saved offline stays on this phone until it is synced.');
  };

  return (
    <View style={st.root}>
      <Image source={require('../../assets/images/login-bg.png')} style={st.bg} resizeMode="cover" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
          <View style={st.card}>
            <Text style={st.title}>Login</Text>
            <Image source={require('../../assets/images/logo.png')} style={st.logo} />
            <Text style={st.label}>Username</Text>
            <Field value={username} onChangeText={setUsername} autoCapitalize="none" autoComplete="username" style={st.input} />
            <Text style={st.label}>Password</Text>
            <Field value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" style={st.input} onSubmitEditing={login} />
            <Btn title={busy ? 'Logging in…' : 'Login'} onPress={login} style={{ flexGrow: 0, flexBasis: 'auto', marginTop: 24 }} />
            <Btn title="Sync Pending Data" variant="outline" onPress={sync} style={{ flexGrow: 0, flexBasis: 'auto', marginTop: 12 }} />
            <View style={st.online}>
              <View style={[st.dot, { backgroundColor: online === false ? C.danger : online ? C.success : C.muted }]} />
              <Text style={{ color: online === false ? C.danger : online ? C.success : C.muted, fontSize: 16 }}>
                {online === false ? 'Offline · saved logins only' : online ? 'Online' : 'Checking…'}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.primary, experimental_backgroundImage: `linear-gradient(180deg, ${C.primaryDark} 40%, ${C.primary} 100%)` },
  bg: { position: 'absolute', top: 0, left: 0, right: 0, height: '41%', width: '100%' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 8, paddingTop: 90, paddingBottom: 40 },
  card: { backgroundColor: C.white, borderRadius: 28, padding: 8, paddingTop: 36, paddingBottom: 28 },
  title: { fontSize: 32, fontWeight: '700', color: C.primary, textAlign: 'center' },
  logo: { width: 120, height: 120, alignSelf: 'center', marginTop: 24, marginBottom: 40 },
  label: { fontSize: 20, color: C.text, marginTop: 14, marginBottom: 10, fontWeight: '500' },
  input: { borderWidth: 0, height: 46 },
  online: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.success },
});
