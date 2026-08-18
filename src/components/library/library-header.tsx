import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { FolderCard } from '@/components/library/library-cards';
import {
  GRID_GAP,
  ROOT_LOCATION,
  sortLabel,
  type DownloadNotice,
} from '@/components/library/library-screen';
import { AppText, useReadlerTheme } from '@/components/readler-ui';
import type { ContentFormat, ContentSourceRecord, LibraryMode } from '@/domain/models';
import type {
  LibraryBreadcrumb,
  LibraryFolderNode,
  LibraryLocation,
  LibrarySort,
} from '@/utils/library-filter';

type IconName = SymbolViewProps['name'];

export function LibraryHeader({
  query,
  format,
  allActive,
  advancedFilterCount,
  error,
  mode,
  downloadNotice,
  location,
  sourceName,
  breadcrumbParts,
  sort,
  searching,
  visibleBookCount,
  visibleFolders,
  sources,
  folderWidth,
  onQueryChange,
  onShowAll,
  onFormatChange,
  onOpenFilters,
  onRetry,
  onClearError,
  onDismissDownloadNotice,
  onNavigate,
}: {
  query: string;
  format: ContentFormat | 'all';
  allActive: boolean;
  advancedFilterCount: number;
  error: string | null;
  mode: LibraryMode | null;
  downloadNotice: DownloadNotice | null;
  location: LibraryLocation;
  sourceName?: string;
  breadcrumbParts: LibraryBreadcrumb[];
  sort: LibrarySort;
  searching: boolean;
  visibleBookCount: number;
  visibleFolders: LibraryFolderNode[];
  sources: ContentSourceRecord[];
  folderWidth: number;
  onQueryChange(value: string): void;
  onShowAll(): void;
  onFormatChange(value: ContentFormat): void;
  onOpenFilters(): void;
  onRetry(): void;
  onClearError(): void;
  onDismissDownloadNotice(): void;
  onNavigate(location: LibraryLocation): void;
}) {
  const { t } = useTranslation();
  const colors = useReadlerTheme();

  return <View style={styles.header}>
    <SearchField value={query} onChange={onQueryChange} />

    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityRole="toolbar">
      <Chip active={allActive} label={t('all')} onPress={onShowAll} />
      {(['cbz', 'epub', 'pdf'] as const).map((value) => (
        <Chip
          key={value}
          active={format === value}
          label={value.toUpperCase()}
          onPress={() => onFormatChange(value)}
        />
      ))}
      <Chip
        active={advancedFilterCount > 0}
        icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
        label={advancedFilterCount ? t('activeFilters', { count: advancedFilterCount }) : t('filters')}
        onPress={onOpenFilters}
      />
    </ScrollView>

    {error ? <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.errorBanner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
      <View style={styles.errorCopy}>
        <AppText style={{ color: colors.danger, fontWeight: '700' }}>{t('libraryUpdateFailed')}</AppText>
        <AppText muted numberOfLines={2}>{error}</AppText>
      </View>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.bannerAction}>
        <AppText style={{ color: colors.primary, fontWeight: '700' }}>{t('retry')}</AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('dismiss')}
        hitSlop={8}
        onPress={onClearError}
        style={styles.iconButton}>
        <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={colors.onSurfaceVariant} size={18} />
      </Pressable>
    </View> : null}

    {mode === 'drive' && downloadNotice ? <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.downloadBanner, {
        backgroundColor: downloadNotice.error ? colors.surface : colors.primaryContainer,
        borderColor: downloadNotice.error ? colors.danger : colors.primaryContainer,
      }]}>
      {downloadNotice.loading ? <ActivityIndicator color={colors.onPrimaryContainer} /> : null}
      <AppText style={{ color: downloadNotice.error ? colors.danger : colors.onPrimaryContainer, flex: 1 }}>{downloadNotice.message}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('dismiss')} onPress={onDismissDownloadNotice} style={styles.iconButton}>
        <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={downloadNotice.error ? colors.danger : colors.onPrimaryContainer} size={18} />
      </Pressable>
    </View> : null}

    <View style={styles.contextRow}>
      <Breadcrumb
        location={location}
        sourceName={sourceName}
        parts={breadcrumbParts}
        onNavigate={onNavigate}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('sortCurrent', { value: sortLabel(sort, t) })}
        onPress={onOpenFilters}
        style={({ pressed }) => [
          styles.sortButton,
          { backgroundColor: colors.surfaceVariant, borderColor: pressed ? colors.outline : colors.outlineVariant },
        ]}>
        <Icon name={{ ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' }} color={colors.onSurfaceVariant} size={18} />
        <AppText muted numberOfLines={1} style={styles.sortLabel}>{sortLabel(sort, t)}</AppText>
      </Pressable>
    </View>

    <AppText accessibilityLiveRegion="polite" muted style={styles.resultCount}>
      {searching ? t('globalResultCount', { count: visibleBookCount }) : t('resultCount', { count: visibleBookCount })}
    </AppText>

    {visibleFolders.length > 0 ? <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{t('folders')}</AppText>
      <View style={styles.folderGrid}>
        {visibleFolders.map((folder) => <FolderCard
          key={folder.key}
          width={folderWidth}
          name={folder.name}
          sourceName={!location.sourceId ? sources.find((source) => source.id === folder.sourceId)?.name : undefined}
          count={folder.itemCount}
          onPress={() => onNavigate({ sourceId: folder.sourceId, path: folder.path })}
        />)}
      </View>
    </View> : null}

    {visibleBookCount > 0 ? <View style={styles.booksHeading}>
      <AppText style={styles.sectionTitle}>{searching ? t('searchResults') : t('books')}</AppText>
    </View> : null}
  </View>;
}

export function LibraryEmpty({ icon, title, body, actions }: {
  icon: IconName;
  title: string;
  body: string;
  actions?: ReactNode;
}) {
  const colors = useReadlerTheme();
  return <View style={styles.emptyState}>
    <View style={[styles.emptyIcon, { backgroundColor: colors.primaryContainer }]}>
      <Icon name={icon} color={colors.onPrimaryContainer} size={34} />
    </View>
    <AppText title style={styles.emptyTitle}>{title}</AppText>
    <AppText muted style={styles.emptyBody}>{body}</AppText>
    {actions ? <View style={styles.emptyActions}>{actions}</View> : null}
  </View>;
}

function SearchField({ value, onChange }: { value: string; onChange(value: string): void }) {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  return <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
    <Icon name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} color={colors.primary} size={22} />
    <TextInput
      accessibilityLabel={t('search')}
      value={value}
      onChangeText={onChange}
      placeholder={t('search')}
      placeholderTextColor={colors.onSurfaceVariant}
      returnKeyType="search"
      autoCapitalize="none"
      autoCorrect={false}
      style={[styles.searchInput, { color: colors.onSurface }]}
    />
    {value ? <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('clearSearch')}
      hitSlop={4}
      onPress={() => onChange('')}
      style={styles.searchClear}>
      <Icon name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} color={colors.onSurfaceVariant} size={21} />
    </Pressable> : null}
  </View>;
}

function Chip({ active, label, icon, onPress }: {
  active: boolean;
  label: string;
  icon?: IconName;
  onPress(): void;
}) {
  const colors = useReadlerTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [
      styles.chip,
      {
        backgroundColor: active ? colors.primary : colors.surfaceVariant,
        borderColor: pressed ? colors.outline : active ? colors.primary : colors.outlineVariant,
      },
    ]}>
    {icon ? <Icon name={icon} color={active ? colors.onPrimary : colors.onSurfaceVariant} size={17} /> : null}
    <AppText style={{ color: active ? colors.onPrimary : colors.onSurfaceVariant, fontWeight: active ? '700' : '600' }}>
      {label}
    </AppText>
  </Pressable>;
}

function Breadcrumb({ location, sourceName, parts, onNavigate }: {
  location: LibraryLocation;
  sourceName?: string;
  parts: LibraryBreadcrumb[];
  onNavigate(location: LibraryLocation): void;
}) {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const entries: { key: string; name: string; target: LibraryLocation }[] = [{
    key: 'root',
    name: t('library'),
    target: ROOT_LOCATION,
  }];
  if (location.sourceId) {
    entries.push({
      key: `source-${location.sourceId}`,
      name: sourceName ?? t('sourceLocal'),
      target: { sourceId: location.sourceId, path: '' },
    });
    for (const part of parts) {
      entries.push({
        key: `${location.sourceId}-${part.path}`,
        name: part.name,
        target: { sourceId: location.sourceId, path: part.path },
      });
    }
  }
  return <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={styles.breadcrumbScroll}
    contentContainerStyle={styles.breadcrumb}
    accessibilityLabel={t('folderPath')}>
    {entries.map((entry, index) => {
      const current = index === entries.length - 1;
      return <View key={entry.key} style={styles.crumbGroup}>
        {index > 0 ? <Icon
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          color={colors.onSurfaceVariant}
          size={14}
        /> : null}
        {current ? <AppText numberOfLines={1} style={styles.currentCrumb}>{entry.name}</AppText> : <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('openFolderNamed', { name: entry.name })}
          onPress={() => onNavigate(entry.target)}
          style={styles.crumbButton}>
          <AppText muted numberOfLines={1}>{entry.name}</AppText>
        </Pressable>}
      </View>;
    })}
  </ScrollView>;
}

function Icon({ name, color, size }: { name: IconName; color: string; size: number }) {
  return <SymbolView name={name} tintColor={color} size={size} style={{ width: size, height: size }} />;
}

const styles = StyleSheet.create({
  header: { paddingTop: 16 },
  searchField: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingLeft: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: { flex: 1, minHeight: 46, paddingHorizontal: 12, paddingVertical: 0, fontSize: 16 },
  searchClear: { width: 44, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 8, paddingVertical: 14 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  errorBanner: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  downloadBanner: { minHeight: 60, borderWidth: 1, borderRadius: 14, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  errorCopy: { flex: 1, paddingVertical: 10 },
  bannerAction: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  contextRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  breadcrumbScroll: { flex: 1 },
  breadcrumb: { minHeight: 44, alignItems: 'center' },
  crumbGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumbButton: { minHeight: 44, maxWidth: 150, paddingHorizontal: 5, justifyContent: 'center' },
  currentCrumb: { maxWidth: 180, paddingHorizontal: 5, fontWeight: '700' },
  sortButton: {
    maxWidth: 150,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sortLabel: { fontWeight: '600', flexShrink: 1 },
  resultCount: { marginTop: 4 },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  folderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginTop: 10 },
  booksHeading: { marginTop: 24, marginBottom: 10 },
  emptyState: { flex: 1, minHeight: 330, padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { maxWidth: 420, textAlign: 'center', marginTop: 7 },
  emptyActions: { width: '100%', maxWidth: 380, gap: 10, marginTop: 20 },
});
