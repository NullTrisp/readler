import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Screen, confirmAction, useReadlerTheme } from '@/components/readler-ui';
import type { LibraryMode } from '@/domain/models';
import { useNoticeTimeout } from '@/hooks/use-notice-timeout';
import { signOutDrive } from '@/services/drive';
import { deleteAllSynchronizedData, deleteLocalAndSynchronizedData } from '@/services/sync';
import { canLinkFolder, useApp } from '@/state/app-provider';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { mode, sources, importFiles, linkFolder, changeLibraryMode, disconnectSource, sync, refresh, loading } = useApp();
  const [driveAction, setDriveAction] = useState<'signOut' | 'changeAccount' | 'deleteSync' | 'deleteAll' | 'revoke' | null>(null);
  const [driveNotice, setDriveNotice] = useState<{ error: boolean; message: string } | null>(null);
  useNoticeTimeout(driveNotice, setDriveNotice);
  const modeName = mode === 'drive' ? t('sourceDrive') : mode === 'local' ? t('sourceLocal') : t('modeUnconfigured');
  const modeHint = t(mode ? 'modeActive' : 'modePreview');

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

  const runDriveAction = async (
    action: NonNullable<typeof driveAction>,
    operation: () => Promise<boolean | number>,
    success: (result: boolean | number) => string,
    openDrive = false,
  ) => {
    setDriveAction(action);
    setDriveNotice(null);
    try {
      const result = await operation();
      if (result === false) return;
      if (openDrive) router.push('/drive');
      else setDriveNotice({ error: false, message: success(result) });
    } catch (caught) {
      setDriveNotice({ error: true, message: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setDriveAction(null);
    }
  };

  const deleteAllReadingData = async () => {
    const deletedSnapshots = await deleteLocalAndSynchronizedData();
    await refresh();
    return deletedSnapshots;
  };

  return <Screen><ScrollView contentContainerStyle={styles.scroll}>
    <View style={styles.content}>
      <View style={styles.section}>
        <AppText title accessibilityRole="header">{t('libraryMode')}</AppText>
        <Card style={styles.modeCard}>
          <View
            accessible
            accessibilityLabel={`${modeName}. ${modeHint}`}
            accessibilityLiveRegion="polite"
            accessibilityState={{ selected: Boolean(mode) }}
            style={styles.modeCopy}
          >
            <AppText style={styles.modeName}>{modeName}</AppText>
            <AppText muted>{modeHint}</AppText>
          </View>
          <View style={styles.modeActions}>
            {mode !== 'local' && <Button disabled={loading} secondary onPress={() => switchMode('local')}>{t('switchToLocal')}</Button>}
            {mode !== 'drive' && <Button disabled={loading} secondary onPress={() => switchMode('drive')}>{t('switchToDrive')}</Button>}
          </View>
        </Card>
      </View>

      {mode && <View style={styles.section}>
        <AppText title accessibilityRole="header">{t('sources')}</AppText>
        {sources.length === 0 ? <AppText muted style={styles.empty}>{t('noSources')}</AppText> : <Card style={styles.sourceList}>
          {sources.map((source, index) => <View key={source.id} style={[
            styles.source,
            index < sources.length - 1 && { borderBottomColor: colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}>
            <View style={styles.sourceCopy}>
              <AppText style={styles.sourceName}>{source.name}</AppText>
              <AppText muted>{source.lastScanAt
                ? t('sourceLastScan', { type: source.kind === 'drive' ? t('sourceDrive') : t('sourceLocal'), date: new Date(source.lastScanAt).toLocaleDateString() })
                : source.kind === 'drive' ? t('sourceDrive') : t('sourceLocal')}</AppText>
            </View>
            <Button danger onPress={() => confirmAction(t('removeSourceTitle'), t('removeSourceHint'), t('cancel'), t('remove'), () => void disconnectSource(source), true)}>{t('remove')}</Button>
          </View>)}
        </Card>}
        <View style={styles.actions}>
          {mode === 'drive' ? <Button disabled={loading} onPress={() => router.push('/drive')}>{t(sources.length ? 'changeDriveFolder' : 'connectDrive')}</Button> : <>
            <Button loading={loading} secondary onPress={() => void (canLinkFolder ? linkFolder() : importFiles())}>{canLinkFolder ? t('linkFolder') : t('importFiles')}</Button>
            {(Platform.OS === 'android' || Platform.OS === 'web') && <Button loading={loading} secondary onPress={() => void importFiles()}>{t('importFiles')}</Button>}
          </>}
          <Button disabled={loading} secondary onPress={() => void sync()}>{t('syncNow')}</Button>
        </View>
      </View>}

      {mode === 'drive' && sources.some((source) => source.kind === 'drive') && <View style={styles.section}>
        <AppText title accessibilityRole="header">Google Drive</AppText>
        <Card style={styles.driveCard}>
          {driveNotice && <View
            accessible
            accessibilityLiveRegion={driveNotice.error ? 'assertive' : 'polite'}
            accessibilityRole={driveNotice.error ? 'alert' : undefined}
          >
            <AppText style={driveNotice.error ? { color: colors.danger } : undefined}>{driveNotice.message}</AppText>
          </View>}
          <View style={styles.actions}>
            <Button disabled={Boolean(driveAction)} loading={driveAction === 'signOut'} secondary onPress={() => void runDriveAction('signOut', () => signOutDrive(false), () => '', true)}>{t('signOut')}</Button>
            <Button disabled={Boolean(driveAction)} loading={driveAction === 'changeAccount'} secondary onPress={() => void runDriveAction('changeAccount', () => signOutDrive(false), () => '', true)}>{t('changeAccount')}</Button>
          </View>
          <View style={[styles.dangerZone, { borderTopColor: colors.outlineVariant }]}>
            <Button disabled={Boolean(driveAction)} loading={driveAction === 'deleteSync'} danger onPress={() => confirmAction(t('deleteSync'), t('deleteSyncHint'), t('cancel'), t('remove'), () => void runDriveAction('deleteSync', deleteAllSynchronizedData, (result) => t(Number(result) ? 'syncDataDeleted' : 'noSyncData', { count: Number(result) })), true)}>{t('deleteSync')}</Button>
            <Button disabled={Boolean(driveAction)} loading={driveAction === 'deleteAll'} danger onPress={() => confirmAction(t('deleteAllReadingData'), t('deleteAllReadingDataHint'), t('cancel'), t('remove'), () => void runDriveAction('deleteAll', deleteAllReadingData, () => t('allReadingDataDeleted')), true)}>{t('deleteAllReadingData')}</Button>
            <Button disabled={Boolean(driveAction)} loading={driveAction === 'revoke'} danger onPress={() => confirmAction(t('revoke'), t('revokeHint'), t('cancel'), t('revoke'), () => void runDriveAction('revoke', () => signOutDrive(true), () => '', true), true)}>{t('revoke')}</Button>
          </View>
        </Card>
      </View>}
      <View accessible style={[styles.footer, { borderTopColor: colors.outlineVariant }]}>
        <AppText style={styles.footerTitle}>Readler 0.1.0 Alpha</AppText>
        <AppText muted>{'CBZ \u00B7 EPUB \u00B7 PDF'}</AppText>
      </View>
    </View>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 18, gap: 28, paddingBottom: 40 },
  section: { gap: 12 },
  modeCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  modeCopy: { flexGrow: 1, flexShrink: 1, minWidth: 220, gap: 4 },
  modeName: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  modeActions: { flexGrow: 1, minWidth: 190, gap: 10 },
  sourceList: { paddingVertical: 0 },
  source: { minHeight: 72, paddingVertical: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  sourceCopy: { flexGrow: 1, flexShrink: 1, minWidth: 200 },
  sourceName: { fontWeight: '700' },
  empty: { paddingVertical: 8 },
  actions: { gap: 10 },
  driveCard: { gap: 18 },
  dangerZone: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18, gap: 10 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18, alignItems: 'center' },
  footerTitle: { fontWeight: '700' },
});
