import { Reader, useReader } from '@epubjs-react-native/core';
import { useFileSystem } from '@epubjs-react-native/expo-file-system';
import { forwardRef, useImperativeHandle } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ReaderHandle, ReaderProps } from './types';
import { clampProgress, normalizeEpubProgress } from '@/utils/locators';

export const EpubReader = forwardRef<ReaderHandle, ReaderProps>(function EpubReader(
  { uri, initialLocator, onLocation, onToggleControls, onMetadata },
  ref,
) {
  const { goNext, goPrevious, goToLocation, getLocations, getMeta } = useReader();
  useImperativeHandle(ref, () => ({
    previous: () => goPrevious(),
    next: () => goNext(),
    seek: (progress) => {
      const locations = getLocations();
      const target = locations[Math.round(clampProgress(progress) * (locations.length - 1))];
      if (target) goToLocation(target);
    },
  }));
  return <View style={styles.container}>
    <Reader src={uri} fileSystem={useFileSystem} flow="paginated" spread="none" enableSwipe
      initialLocation={initialLocator?.kind === 'epubCfi' ? initialLocator.cfi : undefined}
      onReady={() => {
        const meta = getMeta();
        onMetadata?.({ title: meta.title, author: meta.author, coverUri: typeof meta.cover === 'string' ? meta.cover : null });
      }}
      onSingleTap={onToggleControls}
      renderLoadingFileComponent={() => <View style={styles.loading}><ActivityIndicator color="#2E7D32" /></View>}
      renderOpeningBookComponent={() => <View style={styles.loading}><ActivityIndicator color="#2E7D32" /></View>}
      onLocationChange={(_total, location, progress) => {
        const normalized = normalizeEpubProgress(progress);
        onLocation({ kind: 'epubCfi', cfi: location.start.cfi, percent: normalized }, normalized);
      }} />
  </View>;
});

const styles = StyleSheet.create({ container: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
