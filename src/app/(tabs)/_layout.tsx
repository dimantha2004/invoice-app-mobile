import { Tabs } from 'expo-router';
import { TabBar, type TabName } from '../../components/ui';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      backBehavior="history"
      tabBar={({ state }) => <TabBar active={state.routes[state.index].name as TabName} />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="invoices" />
      <Tabs.Screen name="customers" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
