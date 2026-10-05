import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StoreProvider, useStore } from '../lib/store';
import { AlertHost } from '../components/AlertHost';

/** Send the user back to Login when the session ends (logout or expired token). */
function AuthGate() {
  const { ready, user } = useStore();
  const segments = useSegments();
  useEffect(() => {
    if (ready && !user && segments.length > 0) router.replace('/');
  }, [ready, user, segments]);
  return null;
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="light" />
      <AuthGate />
      <AlertHost />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </StoreProvider>
  );
}
