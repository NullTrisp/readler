import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, EmptyState, Screen, useReadlerTheme } from '@/components/readler-ui';
import type { ContentFormat, ReadingStatus } from '@/domain/models';
import { startDownload } from '@/services/downloads';
import { canLinkFolder, useApp } from '@/state/app-provider';
import { libraryFolders, matchesLibraryItem } from '@/utils/library-filter';

export default function LibraryScreen() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { width } = useWindowDimensions();
  const { items, loading, error, refresh, sync, importFiles, linkFolder } = useApp();
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<ContentFormat | 'all'>('all');
  const [status, setStatus] = useState<ReadingStatus | 'all'>('all');
  const [source, setSource] = useState<'all' | 'drive' | 'local'>('all');
  const [folder, setFolder] = useState('all');
  const folders = useMemo(() => libraryFolders(items), [items]);
  const columns = width >= 1400 ? 6 : width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const visible = useMemo(() => items.filter((item) => matchesLibraryItem(item, { query, format, status, source, folder })),
    [folder, format, items, query, source, status]);

  const open = async (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    if (item.sourceKind === 'drive' && !item.localUri) { await startDownload(item, () => void refresh()); await refresh(); }
    router.push({ pathname: '/reader', params: { id } });
  };

  return <Screen>
    <View style={styles.toolbar}>
      <TextInput value={query} onChangeText={setQuery} placeholder={t('search')} placeholderTextColor={colors.onSurfaceVariant}
        style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.outlineVariant, color: colors.onSurface }]} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(['all', 'cbz', 'epub', 'pdf'] as const).map((value) => <Chip key={value} active={format === value} label={value === 'all' ? t('all') : value.toUpperCase()} onPress={() => setFormat(value)} />)}
        {(['all', 'drive', 'local'] as const).map((value) => <Chip key={`source-${value}`} active={source === value} label={value === 'all' ? t('all') : value === 'drive' ? t('sourceDrive') : t('sourceLocal')} onPress={() => setSource(value)} />)}
        {(['unread', 'reading', 'finished'] as const).map((value) => <Chip key={value} active={status === value} label={t(value)} onPress={() => setStatus(status === value ? 'all' : value)} />)}
      </ScrollView>
      {folders.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip active={folder === 'all'} label={t('folders')} onPress={() => setFolder('all')} />
        {folders.map((value) => <Chip key={value} active={folder === value} label={value} onPress={() => setFolder(value)} />)}
      </ScrollView>}
      {error && <AppText style={{ color: colors.danger }}>{error}</AppText>}
    </View>
    <FlatList key={`columns-${columns}`} data={visible} numColumns={columns} keyExtractor={(item) => item.id} columnWrapperStyle={styles.row} contentContainerStyle={visible.length ? styles.grid : { flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void sync()} tintColor={colors.primary} />}
      ListEmptyComponent={<EmptyState title={t('emptyLibrary')} body={t('emptyLibraryHint')} action={<View style={styles.emptyActions}><Button onPress={() => router.push('/drive')}>{t('connectDrive')}</Button><Button secondary onPress={() => void (canLinkFolder ? linkFolder() : importFiles())}>{canLinkFolder ? t('linkFolder') : t('importFiles')}</Button></View>} />}
      renderItem={({ item }) => <Pressable style={styles.item} onPress={() => void open(item.id)}><Card style={styles.bookCard}>
        {item.coverUri ? <Image source={{ uri: item.coverUri }} style={styles.cover} contentFit="cover" /> : <View style={[styles.cover, styles.placeholder, { backgroundColor: colors.primaryContainer }]}><AppText style={[styles.format, { color: colors.onPrimaryContainer }]}>{item.format.toUpperCase()}</AppText></View>}
        <View style={styles.bookCopy}><AppText numberOfLines={2} style={{ fontWeight: '700' }}>{item.title}</AppText><AppText muted numberOfLines={1}>{item.author ?? item.relativePath}</AppText>
          <View style={[styles.progressTrack, { backgroundColor: colors.outlineVariant }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.round(item.progress * 100)}%` }]} /></View><AppText muted>{t('progress', { value: Math.round(item.progress * 100) })}</AppText>
        </View>
      </Card></Pressable>} />
  </Screen>;
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  const colors = useReadlerTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={({ pressed }) => [styles.chip, { backgroundColor: active ? colors.primary : colors.surfaceVariant, borderColor: pressed ? colors.outline : active ? colors.primary : colors.outlineVariant }]}
  ><AppText style={{ color: active ? colors.onPrimary : colors.onSurfaceVariant, fontWeight: active ? '700' : '600' }}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  toolbar: { padding: 16, gap: 10 }, search: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 15, fontSize: 16 },
  chips: { gap: 8 }, chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  grid: { padding: 12, paddingBottom: 32 }, row: { gap: 12 }, item: { flex: 1, maxWidth: '50%', marginBottom: 12 }, bookCard: { padding: 0, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 0.72 }, placeholder: { alignItems: 'center', justifyContent: 'center' }, format: { fontSize: 22, fontWeight: '900' },
  bookCopy: { padding: 12, gap: 5 }, progressTrack: { height: 4, borderRadius: 3, overflow: 'hidden' }, progressFill: { height: 4 }, emptyActions: { gap: 10, width: '100%' },
});
