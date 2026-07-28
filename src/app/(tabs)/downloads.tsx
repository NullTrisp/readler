import { Redirect, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, EmptyState, Screen, useReadlerTheme } from '@/components/readler-ui';
import { cancelDownload, pauseDownload, removeDownload, resumeDownload, startDownload } from '@/services/downloads';
import { useApp } from '@/state/app-provider';

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { items, mode, refresh } = useApp();
  if (mode === 'local') return <Redirect href="/(tabs)" />;
  const downloads = items.filter((item) => item.sourceKind === 'drive' && item.downloadStatus !== 'none');
  return <Screen><FlatList data={downloads} keyExtractor={(item) => item.id} contentContainerStyle={downloads.length ? styles.list : { flexGrow: 1 }}
    ListEmptyComponent={<EmptyState title={t('downloads')} body={t('noDownloads')} />}
    renderItem={({ item }) => <Card style={styles.row}>
      <Pressable style={styles.copy} disabled={!item.localUri} onPress={() => router.push({ pathname: '/reader', params: { id: item.id } })}>
        <AppText style={[styles.badge, { color: colors.primary }]}>{item.format.toUpperCase()}</AppText><View style={{ flex: 1 }}><AppText style={{ fontWeight: '700' }}>{item.title}</AppText>
        <AppText muted>{item.downloadStatus === 'ready' ? t('readyOffline') : `${Math.round(item.downloadProgress * 100)}%`}</AppText>
        {item.downloadStatus === 'downloading' && <View style={[styles.track, { backgroundColor: colors.outlineVariant }]}><View style={[styles.fill, { backgroundColor: colors.primary, width: `${item.downloadProgress * 100}%` }]} /></View>}</View>
      </Pressable>
      {item.downloadStatus === 'ready' ? <Button danger onPress={() => void removeDownload(item).then(() => refresh())}>{t('remove')}</Button> :
        item.downloadStatus === 'error' ? <Button onPress={() => void startDownload(item).then(() => refresh())}>{t('retry')}</Button> :
        item.downloadStatus === 'downloading' ? <Button secondary onPress={() => void pauseDownload(item.id).then(() => refresh())}>{t('pause')}</Button> :
        item.downloadStatus === 'paused' ? <View style={styles.actions}><Button onPress={() => void resumeDownload(item).then(() => refresh())}>{t('resume')}</Button><Button danger onPress={() => void cancelDownload(item.id).then(() => refresh())}>{t('cancel')}</Button></View> : null}
    </Card>} />
  </Screen>;
}

const styles = StyleSheet.create({ list: { padding: 16, gap: 12 }, row: { gap: 14 }, copy: { flexDirection: 'row', alignItems: 'center', gap: 12 }, badge: { fontWeight: '900', width: 46 }, track: { height: 4, marginTop: 7 }, fill: { height: 4 }, actions: { gap: 8 } });
