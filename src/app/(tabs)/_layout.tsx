import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useReadlerTheme } from '@/components/readler-ui';

export default function TabsLayout() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.onSurfaceVariant,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant },
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.onSurface,
    }}>
      <Tabs.Screen name="index" options={{ title: t('library'), tabBarIcon: ({ color }) => <Text style={{ color }}>▦</Text> }} />
      <Tabs.Screen name="downloads" options={{ title: t('downloads'), tabBarIcon: ({ color }) => <Text style={{ color }}>↓</Text> }} />
      <Tabs.Screen name="settings" options={{ title: t('settings'), tabBarIcon: ({ color }) => <Text style={{ color }}>⚙</Text> }} />
    </Tabs>
  );
}
