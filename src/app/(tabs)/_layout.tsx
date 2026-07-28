import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import { useReadlerTheme } from '@/components/readler-ui';
import { useApp } from '@/state/app-provider';

export default function TabsLayout() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { mode } = useApp();
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.onSurfaceVariant,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant },
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.onSurface,
    }}>
      <Tabs.Screen name="index" options={{
        title: t('library'),
        tabBarIcon: ({ color, size }) => <SymbolView
          name={{ ios: 'books.vertical.fill', android: 'local_library', web: 'local_library' }}
          tintColor={color}
          size={size}
        />,
      }} />
      <Tabs.Screen name="downloads" options={{
        href: mode === 'local' ? null : undefined,
        title: t('downloads'),
        tabBarIcon: ({ color, size }) => <SymbolView
          name={{ ios: 'arrow.down.to.line', android: 'download', web: 'download' }}
          tintColor={color}
          size={size}
        />,
      }} />
      <Tabs.Screen name="settings" options={{
        title: t('settings'),
        tabBarIcon: ({ color, size }) => <SymbolView
          name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
          tintColor={color}
          size={size}
        />,
      }} />
    </Tabs>
  );
}
