import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Screen, useReadlerTheme } from '@/components/readler-ui';
import { BookCover } from '@/components/library/book-cover';
import type { ContentFormat, LibraryItem, ReadingStatus } from '@/domain/models';
import { startDownload } from '@/services/downloads';
import { canLinkFolder, useApp } from '@/state/app-provider';
import {
  libraryBreadcrumbs,
  libraryFolderContents,
  matchesLibraryItem,
  sortLibraryItems,
  type LibraryLocation,
  type LibrarySort,
  type VisibleLibraryFilter,
} from '@/utils/library-filter';

type SourceFilter = 'all' | 'drive' | 'local';
type MetadataFilter = string | 'all';
type IconName = SymbolViewProps['name'];

const ROOT_LOCATION: LibraryLocation = { sourceId: null, path: '' };
const CONTENT_MAX_WIDTH = 1440;
const GRID_GAP = 12;

export default function LibraryScreen() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { width } = useWindowDimensions();
  const {
    items,
    sources,
    loading,
    error,
    refresh,
    sync,
    importFiles,
    linkFolder,
    clearError,
  } = useApp();
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<ContentFormat | 'all'>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<ReadingStatus | 'all'>('all');
  const [series, setSeries] = useState<MetadataFilter>('all');
  const [language, setLanguage] = useState<MetadataFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('title');
  const [location, setLocation] = useState<LibraryLocation>(ROOT_LOCATION);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const columns = width >= 1400 ? 6 : width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);
  const horizontalPadding = width >= 1000 ? 20 : 16;
  const availableWidth = Math.max(0, contentWidth - horizontalPadding * 2);
  const itemWidth = Math.floor((availableWidth - GRID_GAP * (columns - 1)) / columns);
  const folderColumns = width < 440 ? 1 : width < 1000 ? 2 : 3;
  const folderWidth = Math.floor((availableWidth - GRID_GAP * (folderColumns - 1)) / folderColumns);

  const seriesOptions = useMemo(() => uniqueMetadata(items.map((item) => item.series)), [items]);
  const languageOptions = useMemo(() => uniqueMetadata(items.map((item) => item.language)), [items]);

  const baseFilter = useMemo<VisibleLibraryFilter>(() => ({
    query: '',
    format,
    status,
    source,
    folder: 'all',
    series: series === 'all' ? undefined : series,
    language: language === 'all' ? undefined : language,
  }), [format, language, series, source, status]);

  const facetMatches = useMemo(
    () => items.filter((item) => matchesLibraryItem(item, baseFilter)),
    [baseFilter, items],
  );
  const folderContents = useMemo(
    () => libraryFolderContents(facetMatches, location),
    [facetMatches, location],
  );
  const searching = query.trim().length > 0;
  const visibleBooks = useMemo(() => {
    const candidates = searching
      ? items.filter((item) => matchesLibraryItem(item, { ...baseFilter, query }))
      : folderContents.items;
    return sortLibraryItems(candidates, sort);
  }, [baseFilter, folderContents.items, items, query, searching, sort]);
  const visibleFolders = searching ? [] : folderContents.folders;

  const advancedFilterCount = Number(status !== 'all') + Number(series !== 'all') + Number(language !== 'all');
  const anyFilterActive = format !== 'all' || source !== 'all' || advancedFilterCount > 0;
  const allActive = !anyFilterActive && location.sourceId === null && location.path === '';
  const sourceAtLocation = sources.find((candidate) => candidate.id === location.sourceId);
  const breadcrumbParts = useMemo(() => {
    if (!location.sourceId) return [];
    return libraryBreadcrumbs(location).filter((part) => part.path.length > 0);
  }, [location]);

  const resetFilters = () => {
    setFormat('all');
    setSource('all');
    setStatus('all');
    setSeries('all');
    setLanguage('all');
  };

  const showAll = () => {
    resetFilters();
    setLocation(ROOT_LOCATION);
  };

  const selectSource = (value: SourceFilter) => {
    setSource((current) => current === value ? 'all' : value);
    setLocation(ROOT_LOCATION);
  };

  const open = async (item: LibraryItem) => {
    if (openingId) return;
    setOpeningId(item.id);
    try {
      if (item.sourceKind === 'drive' && !item.localUri) {
        await startDownload(item, () => void refresh());
        await refresh();
      }
      router.push({ pathname: '/reader', params: { id: item.id } });
    } finally {
      setOpeningId(null);
    }
  };

  const goUp = () => {
    if (!location.sourceId) return;
    if (!location.path) {
      setLocation(ROOT_LOCATION);
      return;
    }
    const segments = location.path.split('/').filter(Boolean);
    segments.pop();
    setLocation({ sourceId: location.sourceId, path: segments.join('/') });
  };

  const emptyState = items.length === 0
    ? <LibraryEmpty
        icon={{ ios: 'books.vertical.fill', android: 'menu_book', web: 'menu_book' }}
        title={t('emptyLibrary')}
        body={t('emptyLibraryHint')}
        actions={<>
          <Button onPress={() => router.push('/drive')}>{t('connectDrive')}</Button>
          <Button secondary onPress={() => void (canLinkFolder ? linkFolder() : importFiles())}>
            {canLinkFolder ? t('linkFolder') : t('importFiles')}
          </Button>
        </>}
      />
    : searching
      ? <LibraryEmpty
          icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          title={t('noResultsTitle')}
          body={t('noResultsQuery', { query: query.trim() })}
          actions={<>
            <Button onPress={() => setQuery('')}>{t('clearSearch')}</Button>
            {anyFilterActive ? <Button secondary onPress={resetFilters}>{t('resetFilters')}</Button> : null}
          </>}
        />
      : anyFilterActive
        ? <LibraryEmpty
            icon={{ ios: 'line.3.horizontal.decrease.circle', android: 'filter_list', web: 'filter_list' }}
            title={t('noResultsTitle')}
            body={t('noFilterResultsBody')}
            actions={<Button onPress={resetFilters}>{t('resetFilters')}</Button>}
          />
        : location.sourceId
          ? <LibraryEmpty
              icon={{ ios: 'folder', android: 'folder', web: 'folder' }}
              title={t('emptyFolder')}
              body={t('emptyFolderHint')}
              actions={<Button onPress={goUp}>{t('goToParentFolder')}</Button>}
            />
          : null;

  const listHeader = <View style={styles.header}>
    <SearchField value={query} onChange={setQuery} />

    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityRole="toolbar">
      <Chip active={allActive} label={t('all')} onPress={showAll} />
      {(['cbz', 'epub', 'pdf'] as const).map((value) => (
        <Chip
          key={value}
          active={format === value}
          label={value.toUpperCase()}
          onPress={() => setFormat((current) => current === value ? 'all' : value)}
        />
      ))}
      <Chip active={source === 'drive'} label={t('sourceDrive')} onPress={() => selectSource('drive')} />
      <Chip active={source === 'local'} label={t('sourceLocal')} onPress={() => selectSource('local')} />
      <Chip
        active={advancedFilterCount > 0}
        icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
        label={advancedFilterCount ? t('activeFilters', { count: advancedFilterCount }) : t('filters')}
        onPress={() => setFiltersOpen(true)}
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
      <Pressable
        accessibilityRole="button"
        onPress={() => { clearError(); void sync().catch(() => undefined); }}
        style={styles.bannerAction}>
        <AppText style={{ color: colors.primary, fontWeight: '700' }}>{t('retry')}</AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('dismiss')}
        hitSlop={8}
        onPress={clearError}
        style={styles.iconButton}>
        <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={colors.onSurfaceVariant} size={18} />
      </Pressable>
    </View> : null}

    <View style={styles.contextRow}>
      <Breadcrumb
        location={location}
        sourceName={sourceAtLocation?.name}
        parts={breadcrumbParts}
        onNavigate={setLocation}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('sortCurrent', { value: sortLabel(sort, t) })}
        onPress={() => setFiltersOpen(true)}
        style={({ pressed }) => [
          styles.sortButton,
          { backgroundColor: colors.surfaceVariant, borderColor: pressed ? colors.outline : colors.outlineVariant },
        ]}>
        <Icon name={{ ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' }} color={colors.onSurfaceVariant} size={18} />
        <AppText muted numberOfLines={1} style={styles.sortLabel}>{sortLabel(sort, t)}</AppText>
      </Pressable>
    </View>

    <AppText
      accessibilityLiveRegion="polite"
      muted
      style={styles.resultCount}>
      {searching ? t('globalResultCount', { count: visibleBooks.length }) : t('resultCount', { count: visibleBooks.length })}
    </AppText>

    {visibleFolders.length > 0 ? <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{t('folders')}</AppText>
      <View style={styles.folderGrid}>
        {visibleFolders.map((folder) => {
          const folderSource = sources.find((candidate) => candidate.id === folder.sourceId);
          return <FolderCard
            key={folder.key}
            width={folderWidth}
            name={folder.name}
            sourceName={!location.sourceId ? folderSource?.name : undefined}
            count={folder.itemCount}
            onPress={() => setLocation({ sourceId: folder.sourceId, path: folder.path })}
          />;
        })}
      </View>
    </View> : null}

    {visibleBooks.length > 0 ? <View style={styles.booksHeading}>
      <AppText style={styles.sectionTitle}>{searching ? t('searchResults') : t('books')}</AppText>
    </View> : null}
  </View>;

  return <Screen>
    <FlatList
      key={`library-${columns}`}
      data={visibleBooks}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      columnWrapperStyle={styles.bookRow}
      contentContainerStyle={[
        styles.content,
        { maxWidth: CONTENT_MAX_WIDTH, paddingHorizontal: horizontalPadding },
        visibleBooks.length === 0 && visibleFolders.length === 0 && styles.contentEmpty,
      ]}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={visibleFolders.length ? null : emptyState}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void sync()} tintColor={colors.primary} />}
      renderItem={({ item }) => <BookCard
        item={item}
        width={itemWidth}
        sourceName={sources.find((candidate) => candidate.id === item.sourceId)?.name}
        showPath={searching}
        opening={openingId === item.id}
        disabled={openingId !== null}
        onPress={() => void open(item).catch(() => undefined)}
      />}
    />

    <FilterAndSortModal
      visible={filtersOpen}
      status={status}
      series={series}
      language={language}
      sort={sort}
      seriesOptions={seriesOptions}
      languageOptions={languageOptions}
      onStatusChange={setStatus}
      onSeriesChange={setSeries}
      onLanguageChange={setLanguage}
      onSortChange={setSort}
      onReset={resetFilters}
      onClose={() => setFiltersOpen(false)}
    />
  </Screen>;
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
  parts: ReturnType<typeof libraryBreadcrumbs>;
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

function FolderCard({ width, name, sourceName, count, onPress }: {
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

function BookCard({ item, width, sourceName, showPath, opening, disabled, onPress }: {
  item: LibraryItem;
  width: number;
  sourceName?: string;
  showPath: boolean;
  opening: boolean;
  disabled: boolean;
  onPress(): void;
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
    onPress={onPress}
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
}

function FilterAndSortModal({
  visible,
  status,
  series,
  language,
  sort,
  seriesOptions,
  languageOptions,
  onStatusChange,
  onSeriesChange,
  onLanguageChange,
  onSortChange,
  onReset,
  onClose,
}: {
  visible: boolean;
  status: ReadingStatus | 'all';
  series: MetadataFilter;
  language: MetadataFilter;
  sort: LibrarySort;
  seriesOptions: string[];
  languageOptions: string[];
  onStatusChange(value: ReadingStatus | 'all'): void;
  onSeriesChange(value: MetadataFilter): void;
  onLanguageChange(value: MetadataFilter): void;
  onSortChange(value: LibrarySort): void;
  onReset(): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const sortOptions: LibrarySort[] = ['title', 'author', 'series', 'modified', 'progress'];
  return <Modal
    visible={visible}
    transparent
    animationType="none"
    onRequestClose={onClose}>
    <View style={[styles.modalRoot, wide && styles.modalRootWide]}>
      <Pressable accessible={false} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View
        accessibilityViewIsModal
        style={[
          styles.filterPanel,
          wide && styles.filterPanelWide,
          { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
        ]}>
        <View style={styles.panelHeader}>
          <AppText title>{t('filterAndSort')}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('closeFilters')}
            onPress={onClose}
            style={styles.iconButton}>
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={colors.onSurface} size={20} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
          <FilterSection title={t('sortBy')}>
            {sortOptions.map((value) => <ChoiceChip
              key={value}
              active={sort === value}
              label={sortLabel(value, t)}
              onPress={() => onSortChange(value)}
            />)}
          </FilterSection>
          <FilterSection title={t('readingStatus')}>
            {(['all', 'unread', 'reading', 'finished'] as const).map((value) => <ChoiceChip
              key={value}
              active={status === value}
              label={value === 'all' ? t('all') : t(value)}
              onPress={() => onStatusChange(value)}
            />)}
          </FilterSection>
          {seriesOptions.length ? <FilterSection title={t('series')}>
            <ChoiceChip active={series === 'all'} label={t('all')} onPress={() => onSeriesChange('all')} />
            {seriesOptions.map((value) => <ChoiceChip
              key={value}
              active={series === value}
              label={value}
              onPress={() => onSeriesChange(value)}
            />)}
          </FilterSection> : null}
          {languageOptions.length ? <FilterSection title={t('language')}>
            <ChoiceChip active={language === 'all'} label={t('all')} onPress={() => onLanguageChange('all')} />
            {languageOptions.map((value) => <ChoiceChip
              key={value}
              active={language === value}
              label={displayLanguage(value)}
              onPress={() => onLanguageChange(value)}
            />)}
          </FilterSection> : null}
        </ScrollView>
        <View style={styles.panelActions}>
          <Button secondary onPress={onReset}>{t('resetFilters')}</Button>
          <Button onPress={onClose}>{t('done')}</Button>
        </View>
      </View>
    </View>
  </Modal>;
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.filterSection}>
    <AppText style={styles.filterTitle}>{title}</AppText>
    <View style={styles.filterChoices}>{children}</View>
  </View>;
}

function ChoiceChip({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  const colors = useReadlerTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={({ pressed }) => [
      styles.choiceChip,
      {
        backgroundColor: active ? colors.primaryContainer : colors.surfaceVariant,
        borderColor: pressed || active ? colors.outline : colors.outlineVariant,
      },
    ]}>
    {active ? <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color={colors.onPrimaryContainer} size={16} /> : null}
    <AppText style={{ color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant, fontWeight: active ? '700' : '600' }}>
      {label}
    </AppText>
  </Pressable>;
}

function LibraryEmpty({ icon, title, body, actions }: {
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

function Icon({ name, color, size }: { name: IconName; color: string; size: number }) {
  return <SymbolView name={name} tintColor={color} size={size} style={{ width: size, height: size }} />;
}

function uniqueMetadata(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b));
}

function displayLanguage(value: string) {
  return value.length <= 3 ? value.toLocaleUpperCase() : value;
}

function sortLabel(sort: LibrarySort, t: (key: string) => string) {
  if (sort === 'author') return t('sortAuthor');
  if (sort === 'series') return t('sortSeries');
  if (sort === 'modified') return t('sortModified');
  if (sort === 'progress') return t('sortProgress');
  return t('sortTitle');
}

const styles = StyleSheet.create({
  content: { width: '100%', alignSelf: 'center', paddingBottom: 36 },
  contentEmpty: { flexGrow: 1 },
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
  booksHeading: { marginTop: 24, marginBottom: 10 },
  bookRow: { gap: GRID_GAP },
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
  emptyState: { flex: 1, minHeight: 330, padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { maxWidth: 420, textAlign: 'center', marginTop: 7 },
  emptyActions: { width: '100%', maxWidth: 380, gap: 10, marginTop: 20 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  modalRootWide: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  filterPanel: {
    maxHeight: '88%',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
  },
  filterPanelWide: { width: '100%', maxWidth: 640, borderRadius: 24 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 2 },
  panelContent: { paddingVertical: 12, gap: 22 },
  filterSection: { gap: 9 },
  filterTitle: { fontWeight: '700' },
  filterChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelActions: { gap: 10, paddingTop: 12 },
});
