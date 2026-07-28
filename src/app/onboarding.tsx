import { router } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Screen, useReadlerTheme } from '@/components/readler-ui';
import { setSetting } from '@/data/repository';
import { useApp } from '@/state/app-provider';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { importFiles, linkFolder, loading } = useApp();

  const local = async () => {
    if (Platform.OS === 'android') await linkFolder(); else await importFiles();
    router.replace('/(tabs)');
  };
  const skip = async () => {
    await setSetting('onboardingComplete', 'true');
    router.replace('/(tabs)');
  };

  return <Screen><SafeAreaView style={styles.safe}>
    <View style={[styles.logo, { backgroundColor: colors.primary }]}><AppText style={[styles.logoText, { color: colors.onPrimary }]}>R</AppText></View>
    <View style={styles.copy}><AppText title style={styles.heading}>{t('onboardingTitle')}</AppText><AppText muted style={styles.body}>{t('onboardingBody')}</AppText></View>
    <View style={styles.actions}>
      <Button disabled={loading} onPress={() => router.push('/drive')}>{t('startDrive')}</Button>
      <Button disabled={loading} secondary onPress={() => void local()}>{t('startLocal')}</Button>
      <Button disabled={loading} secondary onPress={() => void skip()}>{t('skip')}</Button>
    </View>
  </SafeAreaView></Screen>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 28, justifyContent: 'center', gap: 42 },
  logo: { width: 86, height: 86, borderRadius: 26, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }] },
  logoText: { fontSize: 48, fontWeight: '900' },
  copy: { gap: 14 }, heading: { fontSize: 38, lineHeight: 44, textAlign: 'center' }, body: { fontSize: 17, lineHeight: 25, textAlign: 'center' },
  actions: { gap: 12 },
});
