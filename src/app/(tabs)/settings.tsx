import { router } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, Screen } from '@/components/readler-ui';
import { deleteAllSynchronizedData } from '@/services/sync';
import { signOutDrive } from '@/services/drive';
import { canLinkFolder, useApp } from '@/state/app-provider';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { sources, importFiles, linkFolder, disconnectSource, sync, loading } = useApp();
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <AppText title>{t('sources')}</AppText>
    {sources.length === 0 && <AppText muted>{t('noSources')}</AppText>}
    {sources.map((source) => <Card key={source.id} style={styles.source}><View style={{ flex: 1 }}><AppText style={{ fontWeight: '700' }}>{source.name}</AppText><AppText muted>{source.kind === 'drive' ? t('sourceDrive') : t('sourceLocal')}{source.lastScanAt ? ` · ${new Date(source.lastScanAt).toLocaleDateString()}` : ''}</AppText></View><Button danger onPress={() => void disconnectSource(source)}>{t('remove')}</Button></Card>)}
    <View style={styles.actions}>
      <Button disabled={loading} onPress={() => router.push('/drive')}>{t('connectDrive')}</Button>
      <Button disabled={loading} secondary onPress={() => void (canLinkFolder ? linkFolder() : importFiles())}>{canLinkFolder ? t('linkFolder') : t('importFiles')}</Button>
      {(Platform.OS === 'android' || Platform.OS === 'web') && <Button disabled={loading} secondary onPress={() => void importFiles()}>{t('importFiles')}</Button>}
      <Button disabled={loading} secondary onPress={() => void sync()}>{t('syncNow')}</Button>
    </View>
    {sources.some((source) => source.kind === 'drive') && <Card style={styles.dangerZone}>
      <AppText title>Google Drive</AppText>
      <Button secondary onPress={() => void signOutDrive(false)}>{t('signOut')}</Button>
      <Button secondary onPress={() => void signOutDrive(false).then(() => router.push('/drive'))}>{t('changeAccount')}</Button>
      <Button danger onPress={() => Alert.alert(t('deleteSync'), undefined, [{ text: t('cancel'), style: 'cancel' }, { text: t('remove'), style: 'destructive', onPress: () => void deleteAllSynchronizedData() }])}>{t('deleteSync')}</Button>
      <Button danger onPress={() => void signOutDrive(true)}>{t('revoke')}</Button>
    </Card>}
    <Card><AppText style={{ fontWeight: '700' }}>Readler 1.0.0</AppText><AppText muted>CBZ · EPUB · PDF</AppText></Card>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: 18, gap: 14, paddingBottom: 40 }, source: { flexDirection: 'row', alignItems: 'center', gap: 12 }, actions: { gap: 10 }, dangerZone: { gap: 10, marginTop: 14 } });
