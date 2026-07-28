import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { pageFromProgress } from '@/utils/locators';
import type { ReaderHandle, ReaderProps } from './types';

export const PdfReader = forwardRef<ReaderHandle, ReaderProps>(function PdfReader(
  { uri, initialLocator, onLocation, onToggleControls },
  ref,
) {
  const { width, height } = useWindowDimensions();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const document = useRef<PDFDocumentProxy | null>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [page, setPage] = useState(initialLocator?.kind === 'page' ? initialLocator.index : 1);
  const [pages, setPages] = useState(initialLocator?.kind === 'page' ? initialLocator.total ?? 1 : 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      const response = await fetch(uri);
      const task = pdfjs.getDocument({
        data: new Uint8Array(await response.arrayBuffer()),
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/',
        wasmUrl: '/pdfjs/wasm/',
      });
      const loaded = await task.promise;
      if (!mounted) { await loaded.loadingTask.destroy(); return; }
      document.current = loaded;
      setPages(loaded.numPages);
      setPage((value) => Math.min(value, loaded.numPages));
      setLoading(false);
    })().catch((caught) => mounted && setError(caught instanceof Error ? caught.message : String(caught)));
    return () => {
      mounted = false;
      renderTask.current?.cancel();
      void document.current?.loadingTask.destroy();
      document.current = null;
    };
  }, [uri]);

  useEffect(() => {
    const pdf = document.current;
    const target = canvas.current;
    if (!pdf || !target) return;
    let cancelled = false;
    void (async () => {
      renderTask.current?.cancel();
      const pdfPage = await pdf.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const cssScale = Math.min((width - 32) / base.width, (height - 32) / base.height);
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: cssScale * outputScale });
      const context = target.getContext('2d');
      if (!context || cancelled) return;
      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      target.style.width = `${Math.floor(viewport.width / outputScale)}px`;
      target.style.height = `${Math.floor(viewport.height / outputScale)}px`;
      const task = pdfPage.render({ canvas: target, canvasContext: context, viewport });
      renderTask.current = task;
      await task.promise;
      if (!cancelled) onLocation({ kind: 'page', index: page, total: pages }, page / pages);
    })().catch((caught) => {
      if (!cancelled && !(caught instanceof Error && caught.name === 'RenderingCancelledException')) setError(String(caught));
    });
    return () => { cancelled = true; renderTask.current?.cancel(); };
  }, [height, onLocation, page, pages, width]);

  const move = (next: number) => setPage(Math.max(1, Math.min(pages, next)));
  useImperativeHandle(ref, () => ({
    previous: () => move(page - 1),
    next: () => move(page + 1),
    seek: (progress) => move(pageFromProgress(progress, pages)),
  }));

  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  return <Pressable style={styles.center} onPress={onToggleControls}>
    <canvas ref={canvas} style={{ display: loading ? 'none' : 'block', maxWidth: '100%', maxHeight: '100%' }} />
    {loading ? <ActivityIndicator color="#81C784" /> : null}
  </Pressable>;
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', overflow: 'hidden' },
  error: { color: '#fca5a5', textAlign: 'center', padding: 32 },
});
