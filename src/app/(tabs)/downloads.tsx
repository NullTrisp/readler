import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, EmptyState, Screen, confirmAction, useReadlerTheme } from '@/components/readler-ui';
import { useNoticeTimeout } from '@/hooks/use-notice-timeout';
import { cancelDownload, pauseDownload, removeDownload, resumeDownload, startDownload } from '@/services/downloads';
import { useApp } from '@/state/app-provider';

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { items, mode, refresh } = useApp();
  // ponytail: one visible download action at a time; use per-item state if concurrent controls become necessary.
  const [busy, setBusy] = useState<{ id: string; action: 'remove' | 'retry' | 'pause' | 'resume' | 'cancel' } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useNoticeTimeout(actionError, setActionError);
  if (mode === 'local') return <Redirect href="/(tabs)" />;
  const downloads = items.filter((item) => item.sourceKind === 'drive' && item.downloadStatus !== 'none');
  const runAction = async (id: string, action: NonNullable<typeof busy>['action'], task: () => Promise<unknown>) => {
    setActionError(null);
    setBusy({ id, action });
    try { await task(); }
    catch (caught) { setActionError(t('downloadActionFailed', { message: caught instanceof Error ? caught.message : String(caught) })); }
    finally { await refresh().catch(() => undefined); setBusy(null); }
  };
  return <Screen><FlatList data={downloads} keyExtractor={(item) => item.id} contentContainerStyle={downloads.length ? styles.list : styles.emptyList}
    ListHeaderComponent={actionError ? <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={[styles.error, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
      <AppText style={{ color: colors.danger }}>{actionError}</AppText>
    </View> : null}
    ListEmptyComponent={<EmptyState title={t('downloads')} body={t('noDownloads')} />}
    renderItem={({ item }) => {
      const progress = Math.round(Math.min(1, Math.max(0, item.downloadProgress)) * 100);
      const status = item.downloadStatus === 'ready' ? t('readyOffline') :
        item.downloadStatus === 'error' ? t('error') :
        item.downloadStatus === 'downloading' ? t('downloadProgress', { value: progress }) :
        item.downloadStatus === 'queued' ? t('downloadQueued') : t('downloadPaused', { value: progress });
      const itemBusy = busy?.id === item.id;
      return <Card style={styles.row}>
        <View style={styles.rowLayout}>
          <View style={styles.body}>
            <Pressable
              accessibilityHint={item.localUri ? t('openBookHint') : undefined}
              accessibilityLabel={`${item.title}. ${status}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !item.localUri }}
              disabled={!item.localUri}
              onPress={() => router.push({ pathname: '/reader', params: { id: item.id } })}
              style={({ pressed }) => [styles.copy, pressed && styles.copyPressed]}
            >
              <View accessible={false} style={[styles.badge, { backgroundColor: colors.surfaceVariant }]}>
                <AppText style={[styles.badgeText, { color: colors.primary }]}>{item.format.toUpperCase()}</AppText>
              </View>
              <View style={styles.titleBlock}>
                <AppText numberOfLines={2} style={styles.title}>{item.title}</AppText>
                <AppText accessibilityLiveRegion="polite" muted>{status}</AppText>
              </View>
            </Pressable>
            {item.downloadStatus === 'downloading' && <View
              accessibilityLabel={t('downloading')}
              accessibilityLiveRegion="polite"
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progress, text: `${progress}%` }}
              style={[styles.track, { backgroundColor: colors.outlineVariant }]}
            >
              <View style={[styles.fill, { backgroundColor: colors.primary, width: `${progress}%` }]} />
            </View>}
          </View>
          <View style={styles.actions}>
            {item.downloadStatus === 'ready' ? <Button danger disabled={Boolean(busy) && !itemBusy} loading={itemBusy} onPress={() => confirmAction(t('removeDownloadTitle'), t('removeDownloadHint'), t('cancel'), t('removeDownload'), () => void runAction(item.id, 'remove', () => removeDownload(item)), true)}>{t('removeDownload')}</Button> :
              item.downloadStatus === 'error' ? <Button disabled={Boolean(busy) && !itemBusy} loading={itemBusy} onPress={() => void runAction(item.id, 'retry', () => startDownload(item, () => void refresh().catch(() => undefined)))}>{t('retry')}</Button> :
              item.downloadStatus === 'downloading' ? <Button disabled={Boolean(busy) && !itemBusy} loading={itemBusy} secondary onPress={() => void runAction(item.id, 'pause', () => pauseDownload(item.id))}>{t('pause')}</Button> :
              item.downloadStatus === 'paused' ? <><Button disabled={Boolean(busy)} loading={busy?.id === item.id && busy.action === 'resume'} onPress={() => void runAction(item.id, 'resume', () => resumeDownload(item, () => void refresh().catch(() => undefined)))}>{t('resume')}</Button><Button danger disabled={Boolean(busy)} loading={busy?.id === item.id && busy.action === 'cancel'} onPress={() => void runAction(item.id, 'cancel', () => cancelDownload(item.id))}>{t('cancel')}</Button></> : null}
          </View>
        </View>
      </Card>;
    }} />
  </Screen>;
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 18, gap: 12, paddingBottom: 40 },
  emptyList: { width: '100%', maxWidth: 800, alignSelf: 'center', flexGrow: 1 },
  error: { borderWidth: 1, borderRadius: 14, padding: 14, margin: 18, marginBottom: 0 },
  row: { padding: 14 },
  rowLayout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  body: { flexGrow: 1, flexShrink: 1, minWidth: 220, gap: 8 },
  copy: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10 },
  copyPressed: { opacity: 0.72 },
  badge: { width: 52, minHeight: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  titleBlock: { flex: 1 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  track: { height: 6, marginLeft: 64, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  actions: { minWidth: 120, gap: 8 },
});
