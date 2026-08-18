import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Pdf, { type PdfRef } from 'react-native-pdf';

import type { ReaderHandle, ReaderProps } from './types';
import { pageFromProgress } from '@/utils/locators';

export const PdfReader = forwardRef<ReaderHandle, ReaderProps>(function PdfReader(
  { uri, initialLocator, onLocation, onToggleControls, onMetadata },
  ref,
) {
  const pdf = useRef<PdfRef>(null);
  const current = useRef(initialLocator?.kind === 'page' ? initialLocator.index : 1);
  const total = useRef(initialLocator?.kind === 'page' ? initialLocator.total ?? 1 : 1);
  const ready = useRef(false);
  useImperativeHandle(ref, () => ({
    previous: () => {
      if (!ready.current || current.current <= 1) return !ready.current;
      pdf.current?.setPage(current.current - 1);
      return true;
    },
    next: () => {
      if (!ready.current || current.current >= total.current) return !ready.current;
      pdf.current?.setPage(current.current + 1);
      return true;
    },
    seek: (progress) => pdf.current?.setPage(pageFromProgress(progress, total.current)),
  }));
  return <View style={styles.container} onTouchEnd={onToggleControls}>
    <Pdf ref={pdf} source={{ uri }} page={current.current} trustAllCerts={false} style={styles.pdf}
      enableDoubleTapZoom horizontal={false} spacing={8}
      onLoadComplete={(pages) => { ready.current = true; total.current = pages; onMetadata?.({ pageCount: pages }); }}
      onPageChanged={(page, pages) => { current.current = page; total.current = pages; onLocation({ kind: 'page', index: page, total: pages }, page / pages); }} />
  </View>;
});

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#111' }, pdf: { flex: 1, backgroundColor: '#111' } });
