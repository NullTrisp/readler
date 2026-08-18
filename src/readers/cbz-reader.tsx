import { Directory, Paths } from 'expo-file-system';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { getUncompressedSize, isPasswordProtected, unzip } from 'react-native-zip-archive';
import { Image } from 'expo-image';

import { naturalCompare } from '@/utils/natural-sort';
import { parseComicInfo } from '@/utils/comic-info';
import { pageFromProgress } from '@/utils/locators';
import { clampZoomOffset, zoomOffsetForTap } from './zoom';
import type { ReaderHandle, ReaderProps } from './types';

const MAX_FILES = 10_000;
const MAX_UNCOMPRESSED = 2 * 1024 * 1024 * 1024;

interface CbzProps extends ReaderProps { itemId: string; rtl: boolean; }

export const CbzReader = forwardRef<ReaderHandle, CbzProps>(function CbzReader(
  { uri, initialLocator, itemId, rtl, onLocation, onToggleControls, onMetadata }, ref,
) {
  const { width, height } = useWindowDimensions();
  const list = useRef<FlatList<string>>(null);
  const [naturalPages, setNaturalPages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [index, setIndex] = useState(initialLocator?.kind === 'page' ? Math.max(0, initialLocator.index - 1) : 0);
  const pages = useMemo(() => rtl ? [...naturalPages].reverse() : naturalPages, [naturalPages, rtl]);
  const handleZoomChange = useCallback((zoomed: boolean) => setScrollEnabled(!zoomed), []);
  const renderPage = useCallback(({ item }: { item: string }) => <ZoomablePage
    uri={item}
    width={width}
    height={height}
    onTap={onToggleControls}
    onZoomChange={handleZoomChange}
  />, [handleZoomChange, height, onToggleControls, width]);
  const move = useCallback((next: number, animated: boolean) => {
    if (!pages.length) return;
    setScrollEnabled(true);
    list.current?.scrollToIndex({ index: next, animated });
    setIndex(next);
    onLocation({ kind: 'page', index: next + 1, total: pages.length }, (next + 1) / pages.length);
  }, [onLocation, pages.length]);
  useEffect(() => {
    let mounted = true;
    void prepareCbz(uri, itemId).then(({ pages: value, metadata }) => {
      if (!mounted) { clearCbzCache(itemId); return; }
      setNaturalPages(value);
      onMetadata?.({ ...metadata, pageCount: value.length || null });
    }).catch((caught) => {
      if (mounted) setError(caught instanceof Error ? caught.message : String(caught));
      clearCbzCache(itemId);
    });
    return () => { mounted = false; clearCbzCache(itemId); };
  }, [itemId, onMetadata, uri]);
  useImperativeHandle(ref, () => ({
    previous: () => {
      if (!pages.length || index <= 0) return Boolean(!pages.length);
      move(index - 1, true);
      return true;
    },
    next: () => {
      if (!pages.length || index >= pages.length - 1) return Boolean(!pages.length);
      move(index + 1, true);
      return true;
    },
    seek: (progress) => move(pageFromProgress(progress, pages.length) - 1, false),
  }), [index, move, pages.length]);
  if (error) return <View style={styles.loading}><ActivityIndicator color="#FFB4AB" /></View>;
  if (!pages.length) return <View style={styles.loading}><ActivityIndicator color="#81C784" /></View>;
  return <FlatList ref={list} data={pages} horizontal pagingEnabled scrollEnabled={scrollEnabled} initialScrollIndex={Math.min(index, pages.length - 1)}
    keyExtractor={(page) => page} getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
    onMomentumScrollEnd={(event) => { const next = Math.round(event.nativeEvent.contentOffset.x / width); setIndex(next); onLocation({ kind: 'page', index: next + 1, total: pages.length }, (next + 1) / pages.length); }}
    renderItem={renderPage} />;
});

async function prepareCbz(uri: string, itemId: string) {
  const source = nativePath(uri);
  if (await isPasswordProtected(source)) throw new Error('Password-protected CBZ files are not supported.');
  const uncompressed = await getUncompressedSize(source);
  if (uncompressed > MAX_UNCOMPRESSED || uncompressed > Paths.availableDiskSpace * 0.8) throw new Error('The archive is too large for the available storage.');
  const root = new Directory(Paths.cache, 'cbz', itemId);
  if (!root.exists) { root.create({ intermediates: true }); await unzip(source, nativePath(root.uri)); }
  const files: string[] = [];
  collectImages(root, files);
  if (files.length > MAX_FILES) throw new Error('The archive contains too many pages.');
  const metadata = await readComicInfo(root);
  return { pages: files.sort(naturalCompare), metadata };
}

function clearCbzCache(itemId: string) {
  try {
    const root = new Directory(Paths.cache, 'cbz', itemId);
    if (root.exists) root.delete();
  } catch {
    // A native extraction still releasing the directory can finish cleanup on its catch path.
  }
}

function collectImages(directory: Directory, output: string[]) {
  for (const entry of directory.list()) {
    if (entry instanceof Directory) collectImages(entry, output);
    else if (/\.(jpe?g|png|webp|gif|avif)$/i.test(entry.name)) output.push(entry.uri);
  }
}

function nativePath(uri: string) { return uri.replace(/^file:\/\//, ''); }

async function readComicInfo(root: Directory) {
  const files = root.list();
  const comicInfo = files.find((entry) => !(entry instanceof Directory) && entry.name.toLowerCase() === 'comicinfo.xml');
  if (!comicInfo || comicInfo instanceof Directory) return {};
  return parseComicInfo(await comicInfo.text());
}

const ZoomablePage = memo(function ZoomablePage({ uri, width, height, onTap, onZoomChange }: { uri: string; width: number; height: number; onTap(): void; onZoomChange(zoomed: boolean): void }) {
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const tapPending = useSharedValue(false);
  const tapSequence = useSharedValue(0);
  const updateZoomed = (next: boolean) => { setZoomed(next); onZoomChange(next); };
  const pinch = Gesture.Pinch()
    .onBegin(() => { scheduleOnRN(onZoomChange, true); })
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(4, savedScale.value * event.scale));
      translateX.value = clampZoomOffset(translateX.value, width, scale.value);
      translateY.value = clampZoomOffset(translateY.value, height, scale.value);
    })
    .onFinalize(() => {
      if (scale.value < 1.01) { scale.value = 1; translateX.value = 0; translateY.value = 0; }
      savedScale.value = scale.value;
      savedX.value = translateX.value;
      savedY.value = translateY.value;
      scheduleOnRN(updateZoomed, scale.value > 1);
    });
  const pan = Gesture.Pan().enabled(zoomed)
    .onBegin(() => { scheduleOnRN(onZoomChange, true); })
    .onUpdate((event) => {
      translateX.value = clampZoomOffset(savedX.value + event.translationX, width, scale.value);
      translateY.value = clampZoomOffset(savedY.value + event.translationY, height, scale.value);
    })
    .onFinalize(() => { savedX.value = translateX.value; savedY.value = translateY.value; });
  const tap = Gesture.Tap().onEnd((event, success) => {
    if (!success) return;
    const sequence = tapSequence.value + 1;
    tapSequence.value = sequence;
    if (tapPending.value) {
      tapPending.value = false;
      const next = scale.value > 1 ? 1 : 2;
      const nextX = next > 1 ? zoomOffsetForTap(event.x, width, next) : 0;
      const nextY = next > 1 ? zoomOffsetForTap(event.y, height, next) : 0;
      scale.value = withTiming(next);
      savedScale.value = next;
      translateX.value = withTiming(nextX);
      translateY.value = withTiming(nextY);
      savedX.value = nextX;
      savedY.value = nextY;
      scheduleOnRN(updateZoomed, next > 1);
      return;
    }
    tapPending.value = true;
    setTimeout(() => {
      if (!tapPending.value || tapSequence.value !== sequence) return;
      tapPending.value = false;
      scheduleOnRN(onTap);
    }, 300);
  });
  const gesture = Gesture.Simultaneous(pinch, zoomed ? Gesture.Exclusive(pan, tap) : tap);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }] }));
  return <GestureDetector gesture={gesture}><View style={[styles.page, { width }]}><Animated.View style={[styles.imageWrap, style]}><Image source={{ uri }} style={styles.image} contentFit="contain" /></Animated.View></View></GestureDetector>;
});

const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: '#080b12', alignItems: 'center', justifyContent: 'center' }, page: { flex: 1, backgroundColor: '#080b12', overflow: 'hidden' }, imageWrap: { flex: 1 }, image: { flex: 1 } });
