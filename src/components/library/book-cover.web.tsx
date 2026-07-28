import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import { StyleSheet } from 'react-native';

import type { LibraryItem } from '@/domain/models';

interface BookCoverProps {
  item: LibraryItem;
  placeholder: ReactNode;
}

export function BookCover({ item, placeholder }: BookCoverProps) {
  const [failedCoverUri, setFailedCoverUri] = useState<string | null>(null);
  const failed = Boolean(item.coverUri && failedCoverUri === item.coverUri);

  return item.coverUri && !failed ? <Image
    source={{ uri: item.coverUri }}
    style={styles.cover}
    contentFit="cover"
    accessible={false}
    onError={() => setFailedCoverUri(item.coverUri)}
  /> : placeholder;
}

const styles = StyleSheet.create({ cover: { width: '100%', height: '100%' } });
