import { Image } from 'expo-image';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Pdf from 'react-native-pdf';

import type { LibraryItem } from '@/domain/models';
import { materializeLocalItem } from '@/services/local-source';

interface BookCoverProps {
  item: LibraryItem;
  placeholder: ReactNode;
}

export function BookCover({ item, placeholder }: BookCoverProps) {
  const [failedCoverUri, setFailedCoverUri] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<{ key: string; uri: string | null; failed: boolean }>({
    key: '',
    uri: null,
    failed: false,
  });
  const imageFailed = Boolean(item.coverUri && failedCoverUri === item.coverUri);
  const pdfKey = `${item.id}|${item.localUri ?? ''}`;
  const pdfUri = pdfResult.key === pdfKey ? pdfResult.uri : null;
  const pdfFailed = pdfResult.key === pdfKey && pdfResult.failed;

  useEffect(() => {
    let active = true;
    if (item.format !== 'pdf' || !item.localUri) return () => { active = false; };
    if (pdfResult.key === pdfKey && (pdfResult.uri || pdfResult.failed)) return () => { active = false; };
    void materializeLocalItem(item)
      .then((uri) => { if (active) setPdfResult({ key: pdfKey, uri, failed: false }); })
      .catch(() => { if (active) setPdfResult({ key: pdfKey, uri: null, failed: true }); });
    return () => { active = false; };
  }, [item, pdfKey, pdfResult]);

  if (pdfUri && !pdfFailed) {
    return <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.cover}>
      <Pdf
        source={{ uri: pdfUri }}
        page={1}
        singlePage
        scale={1}
        minScale={1}
        maxScale={1}
        fitPolicy={0}
        enablePaging={false}
        enableDoubleTapZoom={false}
        onError={() => setPdfResult({ key: pdfKey, uri: null, failed: true })}
        style={styles.pdf}
      />
    </View>;
  }

  if (item.coverUri && !imageFailed) {
    return <Image
      source={{ uri: item.coverUri }}
      style={styles.cover}
      contentFit="cover"
      accessible={false}
      onError={() => setFailedCoverUri(item.coverUri)}
    />;
  }

  return placeholder;
}

const styles = StyleSheet.create({
  cover: { width: '100%', height: '100%' },
  pdf: { flex: 1, width: '100%', height: '100%', backgroundColor: 'transparent' },
});
