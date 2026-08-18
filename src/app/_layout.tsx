import '@/i18n';
import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from '@/state/app-provider';
import { ReaderProvider } from '@/components/reader-provider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ReaderProvider>
            <AppProvider>
              <BootSplash />
              <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="drive" options={{ title: 'Google Drive', presentation: 'modal' }} />
                <Stack.Screen name="reader" options={{ headerShown: false, animation: 'none' }} />
              </Stack>
            </AppProvider>
          </ReaderProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

function BootSplash() {
  const { ready } = useApp();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  return ready ? null : <View style={{ flex: 1, backgroundColor: '#07130C' }} />;
}
