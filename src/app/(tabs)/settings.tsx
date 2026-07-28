import { router } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, Screen } from '@/components/readler-ui';
import type { LibraryMode } from '@/domain/models';
import { deleteAllSynchronizedData } from '@/services/sync';
import { signOutDrive } from '@/services/drive';
import { canLinkFolder, useApp } from '@/state/app-provider';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { mode, sources, importFiles, linkFolder, changeLibraryMode, disconnectSource, sync, loading } = useApp();

  const switchMode = (nextMode: LibraryMode) => {
    const change = () => void changeLibraryMode(nextMode);
    if (!mode) {
      change();
      return;
    }
    confirmAction(
      t('switchLibraryMode'),
      t('switchLibraryModeHint', { mode: nextMode === 'drive' ? t('sourceDrive') : t('sourceLocal') }),
      t('cancel'),
      t('switchModeAction'),
      change,
    );
  };

  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <AppText title>{t('libraryMode')}</AppText>
    <Card style={styles.modeCard}>
      <AppText style={styles.modeName}>{mode === 'drive' ? t('sourceDrive') : mode === 'local' ? t('sourceLocal') : t('modeUnconfigured')}</AppText>
      <AppText muted>{t(mode ? 'modeActive' : 'modePreview')}</AppText>
      <View style={styles.actions}>
        {mode !== 'local' && <Button disabled={loading} secondary onPress={() => switchMode('local')}>{t('switchToLocal')}</Button>}
        {mode !== 'drive' && <Button disabled={loading} secondary onPress={() => switchMode('drive')}>{t('switchToDrive')}</Button>}
      </View>
    </Card>

    {mode && <>
      <AppText title>{t('sources')}</AppText>
      {sources.length === 0 && <AppText muted>{t('noSources')}</AppText>}
      {sources.map((source) => <Card key={source.id} style={styles.source}><View style={{ flex: 1 }}><AppText style={{ fontWeight: '700' }}>{source.name}</AppText><AppText muted>{source.kind === 'drive' ? t('sourceDrive') : t('sourceLocal')}{source.lastScanAt ? ` · ${new Date(source.lastScanAt).toLocaleDateString()}` : ''}</AppText></View><Button danger onPress={() => void disconnectSource(source)}>{t('remove')}</Button></Card>)}
      <View style={styles.actions}>
        {mode === 'drive' ? <Button disabled={loading} onPress={() => router.push('/drive')}>{t(sources.length ? 'changeDriveFolder' : 'connectDrive')}</Button> : <>
          <Button loading={loading} secondary onPress={() => void (canLinkFolder ? linkFolder() : importFiles())}>{canLinkFolder ? t('linkFolder') : t('importFiles')}</Button>
          {(Platform.OS === 'android' || Platform.OS === 'web') && <Button loading={loading} secondary onPress={() => void importFiles()}>{t('importFiles')}</Button>}
        </>}
        <Button disabled={loading} secondary onPress={() => void sync()}>{t('syncNow')}</Button>
      </View>
    </>}

    {mode === 'drive' && sources.some((source) => source.kind === 'drive') && <Card style={styles.dangerZone}>
      <AppText title>Google Drive</AppText>
      <Button secondary onPress={() => void signOutDrive(false)}>{t('signOut')}</Button>
      <Button secondary onPress={() => void signOutDrive(false).then(() => router.push('/drive'))}>{t('changeAccount')}</Button>
      <Button danger onPress={() => confirmAction(t('deleteSync'), undefined, t('cancel'), t('remove'), () => void deleteAllSynchronizedData(), true)}>{t('deleteSync')}</Button>
      <Button danger onPress={() => void signOutDrive(true)}>{t('revoke')}</Button>
    </Card>}
    <Card><AppText style={{ fontWeight: '700' }}>Readler 1.0.0</AppText><AppText muted>CBZ · EPUB · PDF</AppText></Card>
  </ScrollView></Screen>;
}

function confirmAction(title: string, message: string | undefined, cancel: string, confirm: string, action: () => void, destructive = false) {
  if (Platform.OS === 'web') {
    if (window.confirm([title, message].filter(Boolean).join('\n\n'))) action();
    return;
  }
  Alert.alert(title, message, [
    { text: cancel, style: 'cancel' },
    { text: confirm, style: destructive ? 'destructive' : 'default', onPress: action },
  ]);
}

const styles = StyleSheet.create({ content: { padding: 18, gap: 14, paddingBottom: 40 }, modeCard: { gap: 12 }, modeName: { fontWeight: '700' }, source: { flexDirection: 'row', alignItems: 'center', gap: 12 }, actions: { gap: 10 }, dangerZone: { gap: 10, marginTop: 14 } });
