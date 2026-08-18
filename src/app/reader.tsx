import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, Pressable, StyleSheet, View, useWindowDimensions, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Loading, palette } from '@/components/readler-ui';
import { getLibraryItem, getProgress, getSetting, listBookmarks, saveProgress, setSetting, toggleBookmark, updateItemMetadata } from '@/data/repository';
import { sourceMatchesLibraryMode, type BookMetadata, type LibraryItem, type ReadingLocator } from '@/domain/models';
import { CbzReader } from '@/readers/cbz-reader';
import { EpubReader } from '@/readers/epub-reader';
import { PdfReader } from '@/readers/pdf-reader';
import type { ReaderHandle } from '@/readers/types';
import { materializeLocalItem } from '@/services/local-source';
import { syncReadingState } from '@/services/sync';
import { useApp } from '@/state/app-provider';
import { goBackOrReplaceRoot } from '@/utils/navigation';

export default function ReaderScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const { mode, ready, sources, refresh } = useApp();
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
  const sliderFocused = useRef(false);
  const bookmarkKeys = useRef(new Set<string>());
  const compactChrome = width < 380 || height < 500;
  const seek = useCallback((value: number) => reader.current?.seek(Math.max(0, Math.min(1, value))), []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (sliderFocused.current && event.key === 'ArrowLeft') seek(latest.current.percent - 0.05);
      else if (sliderFocused.current && event.key === 'ArrowRight') seek(latest.current.percent + 0.05);
      else if (sliderFocused.current && event.key === 'Home') seek(0);
      else if (sliderFocused.current && event.key === 'End') seek(1);
      else if (event.key === 'ArrowLeft') reader.current?.previous();
      else if (event.key === 'ArrowRight') reader.current?.next();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [seek]);

  useEffect(() => {
    if (!id || !ready) return;
    void (async () => {
      try {
        setError(null);
        const loaded = await getLibraryItem(id);
        if (!loaded || !sourceMatchesLibraryMode(loaded.sourceKind, mode)) throw new Error(t('inactiveLibraryItem'));
        const progress = await getProgress(id);
        setItem(loaded);
        setLocator(progress?.locator ?? null);
        setPercent(progress?.percent ?? 0);
        latest.current = { locator: progress?.locator ?? null, percent: progress?.percent ?? 0 };
        const bookmarks = await listBookmarks(id);
        bookmarkKeys.current = new Set(bookmarks.map((entry) => JSON.stringify(entry.locator)));
        setBookmarked(Boolean(progress && bookmarkKeys.current.has(JSON.stringify(progress.locator))));
        setRtl((await getSetting(`direction:${id}`)) === 'rtl');
        setUri(await materializeLocalItem(loaded));
      } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    })();
  }, [id, mode, ready, t]);

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
    return () => {
      subscription.remove(); if (timer.current) clearTimeout(timer.current); if (syncTimer.current) clearTimeout(syncTimer.current); void persist().then(() => {
        const drive = sources.find((source) => source.kind === 'drive'); if (drive) return syncReadingState(drive); return undefined;
      });
    };
  }, [persist, sources]);

  const onLocation = useCallback((nextLocator: ReadingLocator, nextPercent: number) => {
    setLocator(nextLocator); setPercent(nextPercent); latest.current = { locator: nextLocator, percent: nextPercent };
    setBookmarked(bookmarkKeys.current.has(JSON.stringify(nextLocator)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), 800);
  }, [persist]);

  const bookmark = async () => {
    const currentLocator = latest.current.locator;
    if (!item || !currentLocator) return;
    const key = JSON.stringify(currentLocator);
    const next = await toggleBookmark(item, currentLocator);
    if (next) bookmarkKeys.current.add(key);
    else bookmarkKeys.current.delete(key);
    const visibleLocator = latest.current.locator;
    setBookmarked(Boolean(visibleLocator && bookmarkKeys.current.has(JSON.stringify(visibleLocator))));
    const drive = sources.find((source) => source.kind === 'drive');
    if (item.sourceKind === 'drive' && drive) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => void syncReadingState(drive).catch(() => undefined), 500);
    }
  };

  const toggleDirection = async () => {
    const next = !rtl; setRtl(next); await setSetting(`direction:${id}`, next ? 'rtl' : 'ltr');
  };

  const onMetadata = useCallback((metadata: Partial<BookMetadata> & { coverUri?: string | null }) => {
    if (!item) return;
    void updateItemMetadata(item.id, metadata).then(() => refresh());
  }, [item, refresh]);
  const leaveReader = () => goBackOrReplaceRoot(router);

  if (error || (item && !uri)) return <View accessibilityRole="alert" style={styles.error}>
    <AppText title style={styles.errorTitle}>{t('readerUnavailable')}</AppText>
    {error ? <AppText style={styles.errorBody}>{error}</AppText> : null}
    <ReaderControl accessibilityRole="button" accessibilityLabel={t('back')} onPress={leaveReader} style={styles.errorAction}>
      <AppText style={styles.controlText}>{t('back')}</AppText>
    </ReaderControl>
  </View>;
  if (!item || !uri) return <View style={styles.container}><Loading /></View>;

  const percentValue = Math.round(Math.max(0, Math.min(1, percent)) * 100);
  const common = {
    uri,
    initialLocator: locator,
    onLocation,
    onToggleControls: () => setControls((value) => !value),
    onMetadata,
  };
  return <View style={styles.container}><StatusBar hidden={!controls} style="light" />
    {item.format === 'cbz' ? <CbzReader ref={reader} {...common} itemId={item.id} rtl={rtl} /> : item.format === 'epub' ? <EpubReader ref={reader} {...common} /> : <PdfReader ref={reader} {...common} />}
    {controls && <SafeAreaView pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.chrome]}>
      <View style={styles.top}><ReaderControl accessibilityRole="button" accessibilityLabel={t('back')} onPress={leaveReader} style={styles.circle}>
        <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor="#fff" />
      </ReaderControl><AppText style={styles.readerTitle} numberOfLines={1}>{item.title}</AppText><ReaderControl
        accessibilityRole="button"
        accessibilityLabel={bookmarked ? t('unbookmark') : t('bookmark')}
        accessibilityState={{ selected: bookmarked }}
        onPress={() => void bookmark()}
        style={styles.circle}
      ><SymbolView
            name={bookmarked
              ? { ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' }
              : { ios: 'bookmark', android: 'bookmark_border', web: 'bookmark_border' }}
            size={21}
            tintColor="#fff"
          /></ReaderControl></View>
      <View style={styles.bottom}>
        <View style={styles.progressRow}>
          <ReaderControl
            accessibilityRole="adjustable"
            accessibilityLabel={t('positionSlider')}
            accessibilityValue={{ min: 0, max: 100, now: percentValue, text: t('progress', { value: percentValue }) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => seek(percent + (event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05))}
            onBlur={() => { sliderFocused.current = false; }}
            onFocus={() => { sliderFocused.current = true; }}
            onLayout={(event) => { trackWidth.current = event.nativeEvent.layout.width; }}
            onPress={(event) => seek(event.nativeEvent.locationX / trackWidth.current)}
            onTouchMove={(event) => seek(event.nativeEvent.locationX / trackWidth.current)}
            style={styles.progressHitArea}>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percentValue}%` }]} /></View>
          </ReaderControl>
          <AppText style={styles.percentText}>{percentValue}%</AppText>
        </View>
        <View style={styles.navigation}>
          <ReaderControl accessibilityRole="button" accessibilityLabel={t('previous')} onPress={() => reader.current?.previous()} style={styles.control}>
            <View style={styles.controlLabel}><SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={18} tintColor="#fff" />{!compactChrome ? <AppText style={styles.controlText}>{t('previous')}</AppText> : null}</View>
          </ReaderControl>
          {item.format === 'cbz' && <ReaderControl
            accessibilityRole="button"
            accessibilityLabel={rtl ? t('rtl') : t('ltr')}
            accessibilityState={{ selected: rtl }}
            onPress={() => void toggleDirection()}
            style={styles.directionControl}>
            <AppText style={styles.controlText}>{rtl ? 'RTL' : 'LTR'}</AppText>
          </ReaderControl>}
          <ReaderControl accessibilityRole="button" accessibilityLabel={t('next')} onPress={() => reader.current?.next()} style={styles.control}>
            <View style={styles.controlLabel}>{!compactChrome ? <AppText style={styles.controlText}>{t('next')}</AppText> : null}<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor="#fff" /></View>
          </ReaderControl>
        </View>
      </View>
    </SafeAreaView>}
  </View>;
}

function ReaderControl({ children, style, onBlur, onFocus, ...props }: PropsWithChildren<Omit<PressableProps, 'children' | 'style'> & { style?: StyleProp<ViewStyle> }>) {
  const [focused, setFocused] = useState(false);
  return <Pressable
    {...props}
    onBlur={(event) => { setFocused(false); onBlur?.(event); }}
    onFocus={(event) => { setFocused(true); onFocus?.(event); }}
    style={({ pressed }) => [style, pressed && styles.controlPressed, focused && Platform.OS === 'web' && styles.controlFocused]}>
    {children}
  </Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080b12' },
  error: { flex: 1, backgroundColor: '#080b12', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 30 },
  errorTitle: { color: '#fff', textAlign: 'center' },
  errorBody: { color: '#C5D0C6', maxWidth: 520, textAlign: 'center' },
  errorAction: { minWidth: 160, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.green800, paddingHorizontal: 18 },
  chrome: { padding: 10 },
  top: { width: '100%', maxWidth: 960, alignSelf: 'center', padding: 8, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(8,11,18,0.92)' },
  readerTitle: { color: '#fff', flex: 1, fontWeight: '700' },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#252b38' },
  bottom: { width: '100%', maxWidth: 960, alignSelf: 'center', marginTop: 'auto', padding: 12, gap: 6, borderRadius: 18, backgroundColor: 'rgba(8,11,18,0.94)' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressHitArea: { flex: 1, minHeight: 44, justifyContent: 'center' },
  progressTrack: { height: 7, backgroundColor: '#37453B', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 999, backgroundColor: palette.green300 },
  percentText: { minWidth: 42, color: '#fff', fontWeight: '700', textAlign: 'right' },
  navigation: { flexDirection: 'row', gap: 8 },
  control: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#252b38', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  directionControl: { minWidth: 64, minHeight: 44, borderRadius: 12, backgroundColor: '#252b38', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  controlText: { color: '#fff', fontWeight: '700' },
  controlLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  controlPressed: { opacity: 0.78 },
  controlFocused: { outlineColor: palette.green300, outlineOffset: 2, outlineStyle: 'solid', outlineWidth: 2 },
});
