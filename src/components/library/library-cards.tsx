import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/library/book-cover';
import { AppText, useReadlerTheme } from '@/components/readler-ui';
import type { LibraryItem } from '@/domain/models';

type IconName = SymbolViewProps['name'];

export function FolderCard({ width, name, sourceName, count, onPress }: {
  width: number;
  name: string;
  sourceName?: string;
  count: number;
  onPress(): void;
}) {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={[name, sourceName, t('folderBookCount', { count })].filter(Boolean).join(', ')}
    accessibilityHint={t('openFolderHint')}
    onPress={onPress}
    style={({ pressed }) => [
      styles.folderCard,
      { width, backgroundColor: colors.surfaceVariant, borderColor: pressed ? colors.outline : colors.outlineVariant },
    ]}>
    <View style={[styles.folderIcon, { backgroundColor: colors.primaryContainer }]}>
      <Icon name={{ ios: 'folder.fill', android: 'folder', web: 'folder' }} color={colors.onPrimaryContainer} size={25} />
    </View>
    <View style={styles.folderCopy}>
      <AppText numberOfLines={1} style={styles.folderName}>{name}</AppText>
      {sourceName ? <AppText muted numberOfLines={1}>{sourceName}</AppText> : null}
      <AppText muted>{t('folderBookCount', { count })}</AppText>
    </View>
    <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={colors.onSurfaceVariant} size={18} />
  </Pressable>;
}

export const BookCard = memo(function BookCard({ item, width, sourceName, showPath, opening, disabled, onPress }: {
  item: LibraryItem;
  width: number;
  sourceName?: string;
  showPath: boolean;
  opening: boolean;
  disabled: boolean;
  onPress(item: LibraryItem): Promise<void>;
}) {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const percent = Math.round(Math.max(0, Math.min(1, item.progress)) * 100);
  const path = item.relativePath.split('/').slice(0, -1).join('/');
  const supportingCopy = item.author ?? item.series ?? (showPath ? path || sourceName : sourceName || path);
  const progressLabel = item.status === 'finished'
    ? t('finished')
    : item.status === 'unread'
      ? t('newBook')
      : `${percent}%`;
  const accessibleMetadata = [
    item.title,
    item.author,
    item.series,
    item.format.toUpperCase(),
    t('progress', { value: percent }),
    showPath ? path : undefined,
  ].filter(Boolean).join(', ');

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibleMetadata}
    accessibilityHint={t('openBookHint')}
    accessibilityState={{ busy: opening, disabled }}
    accessibilityValue={{ min: 0, max: 100, now: percent, text: t('progress', { value: percent }) }}
    disabled={disabled}
    onPress={() => void onPress(item).catch(() => undefined)}
    style={({ pressed }) => [styles.bookItem, { width }, pressed && styles.bookItemPressed]}>
    <View style={[styles.coverFrame, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
      <BookCover item={item} placeholder={<View style={[styles.cover, styles.placeholder, { backgroundColor: colors.primaryContainer }]}>
        <Icon name={{ ios: 'book.closed.fill', android: 'book_2', web: 'book_2' }} color={colors.onPrimaryContainer} size={34} />
        <AppText style={[styles.format, { color: colors.onPrimaryContainer }]}>{item.format.toUpperCase()}</AppText>
      </View>} />
      <View style={styles.progressOverlay} accessible={false}>
        <AppText numberOfLines={1} style={styles.progressLabel}>{progressLabel}</AppText>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${percent}%` }]} />
        </View>
      </View>
      {opening ? <View style={styles.openingOverlay}>
        <ActivityIndicator color="#E3EAE4" />
      </View> : null}
    </View>
    <AppText numberOfLines={2} style={styles.bookTitle}>{item.title}</AppText>
    {supportingCopy ? <AppText muted numberOfLines={1} style={styles.bookMetadata}>{supportingCopy}</AppText> : null}
  </Pressable>;
}, (previous, next) =>
  previous.item.id === next.item.id
  && previous.item.updatedAt === next.item.updatedAt
  && previous.item.localUri === next.item.localUri
  && previous.item.downloadStatus === next.item.downloadStatus
  && previous.item.downloadProgress === next.item.downloadProgress
  && previous.item.status === next.item.status
  && previous.item.progress === next.item.progress
  && previous.width === next.width
  && previous.sourceName === next.sourceName
  && previous.showPath === next.showPath
  && previous.opening === next.opening
  && previous.disabled === next.disabled
  && previous.onPress === next.onPress);

function Icon({ name, color, size }: { name: IconName; color: string; size: number }) {
  return <SymbolView name={name} tintColor={color} size={size} style={{ width: size, height: size }} />;
}

const styles = StyleSheet.create({
  folderCard: {
    minHeight: 86,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  folderIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  folderCopy: { flex: 1 },
  folderName: { fontWeight: '700' },
  bookItem: { marginBottom: 20 },
  bookItemPressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  coverFrame: {
    width: '100%',
    aspectRatio: 0.72,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cover: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  format: { fontSize: 18, lineHeight: 24, fontWeight: '900' },
  progressOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 34,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(7, 19, 12, 0.88)',
  },
  progressLabel: { maxWidth: '42%', color: '#E3EAE4', fontSize: 13, lineHeight: 17, fontWeight: '600' },
  progressTrack: { flex: 1, height: 5, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(227, 234, 228, 0.25)' },
  progressFill: { height: '100%', borderRadius: 999 },
  openingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 19, 12, 0.55)',
  },
  bookTitle: { marginTop: 8, fontWeight: '700' },
  bookMetadata: { marginTop: 2 },
});
