import { Directory, Paths } from 'expo-file-system';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { getUncompressedSize, isPasswordProtected, unzip } from 'react-native-zip-archive';
import { Image } from 'expo-image';

import { naturalCompare } from '@/utils/natural-sort';
import { parseComicInfo } from '@/utils/comic-info';
import { pageFromProgress } from '@/utils/locators';
import type { ReaderHandle, ReaderProps } from './types';

const MAX_FILES = 10_000;
const MAX_UNCOMPRESSED = 2 * 1024 * 1024 * 1024;

interface CbzProps extends ReaderProps { itemId: string; rtl: boolean; }

export const CbzReader = forwardRef<ReaderHandle, CbzProps>(function CbzReader(
  { uri, initialLocator, itemId, rtl, onLocation, onToggleControls, onMetadata }, ref,
) {
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<string>>(null);
  const [naturalPages, setNaturalPages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(initialLocator?.kind === 'page' ? Math.max(0, initialLocator.index - 1) : 0);
  const pages = useMemo(() => rtl ? [...naturalPages].reverse() : naturalPages, [naturalPages, rtl]);
  useEffect(() => {
    let mounted = true;
    void prepareCbz(uri, itemId).then(({ pages: value, metadata }) => {
      if (!mounted) { clearCbzCache(itemId); return; }
      setNaturalPages(value);
      onMetadata?.({ ...metadata, coverUri: value[0] ?? null });
    }).catch((caught) => {
      if (mounted) setError(caught instanceof Error ? caught.message : String(caught));
      clearCbzCache(itemId);
    });
    return () => { mounted = false; clearCbzCache(itemId); };
  }, [itemId, onMetadata, uri]);
  useImperativeHandle(ref, () => ({
    previous: () => list.current?.scrollToIndex({ index: Math.max(0, index - 1), animated: true }),
    next: () => list.current?.scrollToIndex({ index: Math.min(pages.length - 1, index + 1), animated: true }),
    seek: (progress) => list.current?.scrollToIndex({ index: pageFromProgress(progress, pages.length) - 1, animated: false }),
  }), [index, pages.length]);
  if (error) return <View style={styles.loading}><ActivityIndicator color="#FFB4AB" /></View>;
  if (!pages.length) return <View style={styles.loading}><ActivityIndicator color="#81C784" /></View>;
  return <FlatList ref={list} data={pages} horizontal pagingEnabled initialScrollIndex={Math.min(index, pages.length - 1)}
    keyExtractor={(page) => page} getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
    onMomentumScrollEnd={(event) => { const next = Math.round(event.nativeEvent.contentOffset.x / width); setIndex(next); onLocation({ kind: 'page', index: next + 1, total: pages.length }, (next + 1) / pages.length); }}
    renderItem={({ item }) => <ZoomablePage uri={item} width={width} onTap={onToggleControls} />} />;
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

function ZoomablePage({ uri, width, onTap }: { uri: string; width: number; onTap(): void }) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const pinch = Gesture.Pinch().onUpdate((event) => { scale.value = Math.max(1, Math.min(4, saved.value * event.scale)); }).onEnd(() => { saved.value = scale.value; });
  const tap = Gesture.Tap().onEnd(() => { onTap(); }).runOnJS(true);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <GestureDetector gesture={Gesture.Simultaneous(pinch, tap)}><View style={[styles.page, { width }]}><Animated.View style={[styles.imageWrap, style]}><Image source={{ uri }} style={styles.image} contentFit="contain" /></Animated.View></View></GestureDetector>;
}

const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: '#080b12', alignItems: 'center', justifyContent: 'center' }, page: { flex: 1, backgroundColor: '#080b12', overflow: 'hidden' }, imageWrap: { flex: 1 }, image: { flex: 1 } });
