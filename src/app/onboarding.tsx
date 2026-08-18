import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Screen, useReadlerTheme } from '@/components/readler-ui';
import { setSetting } from '@/data/repository';
import { canLinkFolder, useApp } from '@/state/app-provider';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { importFiles, linkFolder, loading } = useApp();

  const local = async () => {
    const connected = canLinkFolder ? await linkFolder() : await importFiles();
    if (connected) router.replace('/(tabs)');
  };
  const skip = async () => {
    await setSetting('onboardingComplete', 'true');
    router.replace('/(tabs)');
  };

  return <Screen><SafeAreaView style={styles.safe}><ScrollView alwaysBounceVertical={false} contentContainerStyle={styles.scroll}>
    <View style={styles.layout}>
      <View style={styles.hero}>
        <View accessibilityLabel="Readler" accessibilityRole="image" accessible style={[styles.logo, { backgroundColor: colors.primary }]}>
          <View style={[styles.spine, { backgroundColor: colors.onPrimary }]} />
          <AppText style={[styles.logoText, { color: colors.onPrimary }]}>R</AppText>
        </View>
        <View style={styles.copy}><AppText title style={styles.heading}>{t('onboardingTitle')}</AppText><AppText muted style={styles.body}>{t('onboardingBody')}</AppText></View>
      </View>
      <View style={styles.actions}>
        <Button disabled={loading} onPress={() => router.push('/drive')}>{t('startDrive')}</Button>
        <Button loading={loading} secondary onPress={() => void local()}>{t('startLocal')}</Button>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          onPress={() => void skip()}
          style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
            styles.tertiary,
            pressed && !loading && { backgroundColor: colors.surfaceVariant },
            focused && { outlineColor: colors.outline, outlineOffset: 3, outlineStyle: 'solid', outlineWidth: 2 },
          ]}>
          <AppText style={[styles.tertiaryText, { color: loading ? colors.onDisabled : colors.primary }]}>{t('skip')}</AppText>
        </Pressable>
      </View>
    </View>
  </ScrollView></SafeAreaView></Screen>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 20 },
  layout: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 32, paddingVertical: 32 },
  logo: { width: 76, height: 88, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  spine: { position: 'absolute', left: 12, top: 10, bottom: 10, width: 2, borderRadius: 1, opacity: 0.45 },
  logoText: { fontSize: 44, lineHeight: 50, fontWeight: '900' },
  copy: { maxWidth: 480, gap: 14 },
  heading: { fontSize: 38, lineHeight: 44, textAlign: 'center' },
  body: { fontSize: 17, lineHeight: 25, textAlign: 'center' },
  actions: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 10, paddingBottom: 8 },
  tertiary: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  tertiaryText: { fontWeight: '700' },
});
