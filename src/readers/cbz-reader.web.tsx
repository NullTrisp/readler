import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { parseComicInfo } from '@/utils/comic-info';
import { pageFromProgress } from '@/utils/locators';
import { naturalCompare } from '@/utils/natural-sort';
import type { ReaderHandle, ReaderProps } from './types';

const MAX_FILES = 10_000;
const MAX_UNCOMPRESSED = 2 * 1024 * 1024 * 1024;

interface CbzProps extends ReaderProps { itemId: string; rtl: boolean; }

export const CbzReader = forwardRef<ReaderHandle, CbzProps>(function CbzReader(
  { uri, initialLocator, rtl, onLocation, onToggleControls, onMetadata },
  ref,
) {
  const [naturalPages, setNaturalPages] = useState<string[]>([]);
  const [index, setIndex] = useState(initialLocator?.kind === 'page' ? Math.max(0, initialLocator.index - 1) : 0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const pages = useMemo(() => rtl ? [...naturalPages].reverse() : naturalPages, [naturalPages, rtl]);

  useEffect(() => {
    let mounted = true;
    const urls: string[] = [];
    void (async () => {
      const JSZip = (await import('jszip')).default;
      const archiveResponse = await fetch(uri);
      const archiveBuffer = await archiveResponse.arrayBuffer();
      const archive = await JSZip.loadAsync(archiveBuffer, { checkCRC32: true });
      const entries = Object.values(archive.files).filter((entry) => !entry.dir);
      if (entries.length > MAX_FILES) throw new Error('The archive contains too many entries.');
      if (entries.some((entry) => unsafePath(entry.name))) throw new Error('The archive contains an unsafe path.');
      const images = entries.filter((entry) => /\.(jpe?g|png|webp|gif|avif)$/i.test(entry.name)).sort((a, b) => naturalCompare(a.name, b.name));
      let extractedBytes = 0;
      for (const entry of images) {
        const blob = await entry.async('blob');
        extractedBytes += blob.size;
        if (extractedBytes > MAX_UNCOMPRESSED) throw new Error('The archive is too large to open safely.');
        urls.push(URL.createObjectURL(blob));
      }
      const comicInfo = entries.find((entry) => /(^|\/)ComicInfo\.xml$/i.test(entry.name));
      const metadata = comicInfo ? parseComicInfo(await comicInfo.async('text')) : {};
      if (!mounted) return;
      setNaturalPages(urls);
      onMetadata?.({ ...metadata, pageCount: urls.length || null });
    })().catch((caught) => mounted && setError(caught instanceof Error ? caught.message : String(caught)));
    return () => {
      mounted = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [onMetadata, uri]);

  const move = (next: number) => {
    const safe = Math.max(0, Math.min(pages.length - 1, next));
    setIndex(safe);
    setZoom(1);
    if (pages.length) onLocation({ kind: 'page', index: safe + 1, total: pages.length }, (safe + 1) / pages.length);
  };

  useImperativeHandle(ref, () => ({
    previous: () => {
      if (!pages.length || index <= 0) return Boolean(!pages.length);
      move(index - 1);
      return true;
    },
    next: () => {
      if (!pages.length || index >= pages.length - 1) return Boolean(!pages.length);
      move(index + 1);
      return true;
    },
    seek: (progress) => move(pageFromProgress(progress, pages.length) - 1),
  }));

  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  if (!pages.length) return <View style={styles.center}><ActivityIndicator color="#81C784" /></View>;
  return <Pressable style={styles.page} onPress={onToggleControls} onLongPress={() => setZoom((value) => value >= 3 ? 1 : value + 0.5)}>
    <Image source={{ uri: pages[index] }} style={[styles.image, { transform: [{ scale: zoom }] }]} contentFit="contain" />
  </Pressable>;
});

function unsafePath(name: string) {
  return name.startsWith('/') || name.startsWith('\\') || name.split(/[\\/]/).some((part) => part === '..');
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080b12', padding: 32 },
  error: { color: '#fca5a5', textAlign: 'center' },
  page: { flex: 1, backgroundColor: '#080b12', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
