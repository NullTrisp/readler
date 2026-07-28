import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppText, Loading, palette } from '@/components/readler-ui';
import { getLibraryItem, getProgress, getSetting, listBookmarks, saveProgress, setSetting, toggleBookmark, updateItemMetadata } from '@/data/repository';
import type { LibraryItem, ReadingLocator } from '@/domain/models';
import { CbzReader } from '@/readers/cbz-reader';
import { EpubReader } from '@/readers/epub-reader';
import { PdfReader } from '@/readers/pdf-reader';
import type { ReaderHandle } from '@/readers/types';
import { materializeLocalItem } from '@/services/local-source';
import { syncReadingState } from '@/services/sync';
import { useApp } from '@/state/app-provider';

export default function ReaderScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sources, refresh } = useApp();
  const reader = useRef<ReaderHandle>(null);
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [locator, setLocator] = useState<ReadingLocator | null>(null);
  const [percent, setPercent] = useState(0);
  const [controls, setControls] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<{ locator: ReadingLocator | null; percent: number }>({ locator: null, percent: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackWidth = useRef(1);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const loaded = await getLibraryItem(id);
        if (!loaded) throw new Error('The library item no longer exists.');
        const progress = await getProgress(id);
        setItem(loaded);
        setLocator(progress?.locator ?? null);
        setPercent(progress?.percent ?? 0);
        latest.current = { locator: progress?.locator ?? null, percent: progress?.percent ?? 0 };
        const bookmarks = await listBookmarks(id);
        if (progress) setBookmarked(bookmarks.some((entry) => JSON.stringify(entry.locator) === JSON.stringify(progress.locator)));
        setRtl((await getSetting(`direction:${id}`)) === 'rtl');
        setUri(await materializeLocalItem(loaded));
      } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    })();
  }, [id]);

  const persist = useCallback(async () => {
    if (!item || !latest.current.locator) return;
    await saveProgress(item, latest.current.locator, latest.current.percent);
    await refresh();
    if (item.sourceKind === 'drive') {
      const drive = sources.find((source) => source.kind === 'drive');
      if (drive) {
        if (syncTimer.current) clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => void syncReadingState(drive).catch(() => undefined), 1500);
      }
    }
  }, [item, refresh, sources]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') void persist(); });
    return () => { subscription.remove(); if (timer.current) clearTimeout(timer.current); if (syncTimer.current) clearTimeout(syncTimer.current); void persist().then(() => {
      const drive = sources.find((source) => source.kind === 'drive'); if (drive) return syncReadingState(drive); return undefined;
    }); };
  }, [persist, sources]);

  const onLocation = useCallback((nextLocator: ReadingLocator, nextPercent: number) => {
    setLocator(nextLocator); setPercent(nextPercent); latest.current = { locator: nextLocator, percent: nextPercent };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), 800);
  }, [persist]);

  const bookmark = async () => {
    if (!item || !locator) return;
    setBookmarked(await toggleBookmark(item, locator));
    const drive = sources.find((source) => source.kind === 'drive');
    if (item.sourceKind === 'drive' && drive) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => void syncReadingState(drive).catch(() => undefined), 500);
    }
  };

  const toggleDirection = async () => {
    const next = !rtl; setRtl(next); await setSetting(`direction:${id}`, next ? 'rtl' : 'ltr');
  };

  const onMetadata = useCallback((metadata: { title?: string | null; author?: string | null; coverUri?: string | null }) => {
    if (!item) return;
    void updateItemMetadata(item.id, metadata).then(() => refresh());
  }, [item, refresh]);

  if (error || (item && !uri)) return <View style={styles.error}><AppText title>{t('readerUnavailable')}</AppText><AppText muted>{error}</AppText><Pressable onPress={() => router.back()} style={styles.control}><AppText style={styles.controlText}>{t('back')}</AppText></Pressable></View>;
  if (!item || !uri) return <Loading />;

  const common = {
    uri,
    initialLocator: locator,
    onLocation,
    onToggleControls: () => setControls((value) => !value),
    onMetadata,
  };
  return <View style={styles.container}><StatusBar hidden={!controls} style="light" />
    {item.format === 'cbz' ? <CbzReader ref={reader} {...common} itemId={item.id} rtl={rtl} /> : item.format === 'epub' ? <EpubReader ref={reader} {...common} /> : <PdfReader ref={reader} {...common} />}
    {controls && <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={styles.top}><Pressable onPress={() => router.back()} style={styles.circle}><AppText style={styles.controlText}>‹</AppText></Pressable><AppText style={styles.readerTitle} numberOfLines={1}>{item.title}</AppText><Pressable onPress={() => void bookmark()} style={styles.circle}><AppText style={styles.controlText}>{bookmarked ? '◆' : '◇'}</AppText></Pressable></View>
      <View style={styles.bottom}><Pressable accessibilityRole="adjustable" accessibilityLabel={t('positionSlider')}
        onLayout={(event) => { trackWidth.current = event.nativeEvent.layout.width; }}
        onPress={(event) => reader.current?.seek(Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth.current)))}
        onTouchMove={(event) => reader.current?.seek(Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth.current)))}
        style={styles.progress}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, percent * 100))}%` }]} /></Pressable><AppText style={styles.controlText}>{Math.round(percent * 100)}%</AppText>
        <View style={styles.navigation}><Pressable onPress={() => reader.current?.previous()} style={styles.control}><AppText style={styles.controlText}>‹ {t('previous')}</AppText></Pressable>
          {item.format === 'cbz' && <Pressable onPress={() => void toggleDirection()} style={styles.control}><AppText style={styles.controlText}>{rtl ? t('rtl') : t('ltr')}</AppText></Pressable>}
          <Pressable onPress={() => reader.current?.next()} style={styles.control}><AppText style={styles.controlText}>{t('next')} ›</AppText></Pressable></View>
      </View>
    </SafeAreaView>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080b12' }, error: { flex: 1, backgroundColor: '#080b12', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 30 },
  top: { margin: 10, padding: 10, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(8,11,18,0.92)' },
  readerTitle: { color: '#fff', flex: 1, fontWeight: '700' }, circle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#252b38' },
  bottom: { marginTop: 'auto', margin: 10, padding: 14, gap: 10, borderRadius: 18, backgroundColor: 'rgba(8,11,18,0.94)' }, progress: { height: 5, backgroundColor: '#37453B', borderRadius: 4, overflow: 'hidden' }, progressFill: { height: 5, backgroundColor: palette.green300 },
  navigation: { flexDirection: 'row', gap: 8 }, control: { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: '#252b38', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, controlText: { color: '#fff', fontWeight: '700' },
});
