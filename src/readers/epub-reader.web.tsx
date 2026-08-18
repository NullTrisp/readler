import type { Book, Location, Rendition } from 'epubjs';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { clampProgress } from '@/utils/locators';
import type { ReaderHandle, ReaderProps } from './types';

export const EpubReader = forwardRef<ReaderHandle, ReaderProps>(function EpubReader(
  { uri, initialLocator, onLocation, onToggleControls, onMetadata },
  ref,
) {
  const host = useRef<HTMLElement | null>(null);
  const book = useRef<Book | null>(null);
  const rendition = useRef<Rendition | null>(null);
  const boundary = useRef({ atStart: false, atEnd: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!host.current) return;
      const [{ default: ePub }, response] = await Promise.all([import('epubjs'), fetch(uri)]);
      const loadedBook = ePub(await response.arrayBuffer());
      book.current = loadedBook;
      await loadedBook.ready;
      await loadedBook.locations.generate(1500);
      const metadata = await loadedBook.loaded.metadata;
      if (!mounted) return;
      onMetadata?.({ title: metadata.title, author: metadata.creator });
      const loadedRendition = loadedBook.renderTo(host.current, { width: '100%', height: '100%', spread: 'none', flow: 'paginated' });
      rendition.current = loadedRendition;
      loadedRendition.on('relocated', (location: Location) => {
        boundary.current = { atStart: location.atStart, atEnd: location.atEnd };
        const cfi = location.start.cfi;
        const percent = clampProgress(loadedBook.locations.percentageFromCfi(cfi));
        onLocation({ kind: 'epubCfi', cfi, percent }, percent);
      });
      loadedRendition.on('click', onToggleControls);
      await loadedRendition.display(initialLocator?.kind === 'epubCfi' ? initialLocator.cfi : undefined);
      if (mounted) setLoading(false);
    })().catch((caught) => mounted && setError(caught instanceof Error ? caught.message : String(caught)));
    return () => {
      mounted = false;
      rendition.current?.destroy();
      book.current?.destroy();
      rendition.current = null;
      book.current = null;
    };
  }, [initialLocator, onLocation, onMetadata, onToggleControls, uri]);

  useImperativeHandle(ref, () => ({
    previous: () => {
      if (loading || boundary.current.atStart) return loading;
      void rendition.current?.prev();
      return true;
    },
    next: () => {
      if (loading || boundary.current.atEnd) return loading;
      void rendition.current?.next();
      return true;
    },
    seek: (progress) => {
      const cfi = book.current?.locations.cfiFromPercentage(clampProgress(progress));
      if (cfi) void rendition.current?.display(cfi);
    },
  }));

  return <View style={styles.container}>
    <div ref={(node) => { host.current = node; }} style={{ width: '100%', height: '100%', background: '#fff' }} />
    {loading && !error ? <View style={styles.overlay}><ActivityIndicator color="#2E7D32" /></View> : null}
    {error ? <View style={styles.overlay}><Text style={styles.error}>{error}</Text></View> : null}
  </View>;
});

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  overlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 32 },
  error: { color: '#b91c1c', textAlign: 'center' },
});
