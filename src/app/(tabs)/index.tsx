import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions } from 'react-native';

import { BookCard } from '@/components/library/library-cards';
import { FilterAndSortModal } from '@/components/library/filter-and-sort-modal';
import { LibraryEmpty, LibraryHeader } from '@/components/library/library-header';
import {
  CONTENT_MAX_WIDTH,
  GRID_GAP,
  ROOT_LOCATION,
  uniqueMetadata,
  type DownloadNotice,
  type MetadataFilter,
} from '@/components/library/library-screen';
import { Button, Screen, useReadlerTheme } from '@/components/readler-ui';
import { getDownload } from '@/data/repository';
import { downloadIsReady, type ContentFormat, type LibraryItem, type ReadingStatus } from '@/domain/models';
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
    mode,
    changeLibraryMode,
    clearError,
  } = useApp();
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<ContentFormat | 'all'>('all');
  const [status, setStatus] = useState<ReadingStatus | 'all'>('all');
  const [series, setSeries] = useState<MetadataFilter>('all');
  const [language, setLanguage] = useState<MetadataFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('title');
  const [location, setLocation] = useState<LibraryLocation>(ROOT_LOCATION);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [downloadNotice, setDownloadNotice] = useState<DownloadNotice | null>(null);
  const opening = useRef(false);
  const pendingOpenId = useRef<string | null>(null);
  const activeLocation = location.sourceId && !sources.some((source) => source.id === location.sourceId) ? ROOT_LOCATION : location;

  useFocusEffect(useCallback(() => () => { pendingOpenId.current = null; }, []));

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
    folder: 'all',
    series: series === 'all' ? undefined : series,
    language: language === 'all' ? undefined : language,
  }), [format, language, series, status]);

  const facetMatches = useMemo(
    () => items.filter((item) => matchesLibraryItem(item, baseFilter)),
    [baseFilter, items],
  );
  const folderContents = useMemo(
    () => libraryFolderContents(facetMatches, activeLocation),
    [activeLocation, facetMatches],
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
  const anyFilterActive = format !== 'all' || advancedFilterCount > 0;
  const allActive = !anyFilterActive && activeLocation.sourceId === null && activeLocation.path === '';
  const sourceAtLocation = sources.find((candidate) => candidate.id === activeLocation.sourceId);
  const breadcrumbParts = useMemo(() => {
    if (!activeLocation.sourceId) return [];
    return libraryBreadcrumbs(activeLocation).filter((part) => part.path.length > 0);
  }, [activeLocation]);

  const resetFilters = () => {
    setFormat('all');
    setStatus('all');
    setSeries('all');
    setLanguage('all');
  };

  const showAll = () => {
    resetFilters();
    setLocation(ROOT_LOCATION);
  };

  const open = useCallback(async (item: LibraryItem) => {
    if (opening.current) return;
    opening.current = true;
    setOpeningId(item.id);
    try {
      if (item.sourceKind === 'drive' && !item.localUri) {
        pendingOpenId.current = item.id;
        setDownloadingIds((ids) => [...ids, item.id]);
        setDownloadNotice({ message: t('downloadStarted', { title: item.title }), loading: true });
        void startDownload(item, () => void refresh().catch(() => undefined))
          .then(async () => {
            const download = await getDownload(item.id);
            await refresh().catch(() => undefined);
            if (!downloadIsReady(download)) {
              if (pendingOpenId.current === item.id) pendingOpenId.current = null;
              setDownloadNotice(null);
              return;
            }
            setDownloadNotice({ message: t('downloadFinished', { title: item.title }), loading: false });
            if (pendingOpenId.current === item.id) {
              pendingOpenId.current = null;
              router.push({ pathname: '/reader', params: { id: item.id } });
            }
          })
          .catch(async () => {
            await refresh().catch(() => undefined);
            if (pendingOpenId.current === item.id) pendingOpenId.current = null;
            setDownloadNotice({ message: t('downloadFailed', { title: item.title }), loading: false, error: true });
          })
          .finally(() => setDownloadingIds((ids) => ids.filter((id) => id !== item.id)));
        return;
      }
      router.push({ pathname: '/reader', params: { id: item.id } });
    } finally {
      opening.current = false;
      setOpeningId(null);
    }
  }, [refresh, t]);

  const goUp = () => {
    if (!activeLocation.sourceId) return;
    if (!activeLocation.path) {
      setLocation(ROOT_LOCATION);
      return;
    }
    const segments = activeLocation.path.split('/').filter(Boolean);
    segments.pop();
    setLocation({ sourceId: activeLocation.sourceId, path: segments.join('/') });
  };

  const emptyHint = mode === 'drive' ? t('emptyDriveLibraryHint') : mode === 'local' ? t('emptyLocalLibraryHint') : t('emptyLibraryHint');
  const emptyActions = mode === 'drive'
    ? <Button onPress={() => router.push('/drive')}>{t('connectDrive')}</Button>
    : mode === 'local'
      ? <Button loading={loading} onPress={() => void (canLinkFolder ? linkFolder() : importFiles())}>
          {canLinkFolder ? t('linkFolder') : t('importFiles')}
        </Button>
      : <>
          <Button disabled={loading} onPress={() => void changeLibraryMode('drive')}>{t('switchToDrive')}</Button>
          <Button loading={loading} secondary onPress={() => void changeLibraryMode('local')}>{t('switchToLocal')}</Button>
        </>;

  const emptyState = items.length === 0
    ? <LibraryEmpty
        icon={{ ios: 'books.vertical.fill', android: 'menu_book', web: 'menu_book' }}
        title={t('emptyLibrary')}
        body={emptyHint}
        actions={emptyActions}
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
        : activeLocation.sourceId
          ? <LibraryEmpty
              icon={{ ios: 'folder', android: 'folder', web: 'folder' }}
              title={t('emptyFolder')}
              body={t('emptyFolderHint')}
              actions={<Button onPress={goUp}>{t('goToParentFolder')}</Button>}
            />
          : null;

  const renderBook = useCallback(({ item }: { item: LibraryItem }) => <BookCard
    item={item}
    width={itemWidth}
    sourceName={sources.find((candidate) => candidate.id === item.sourceId)?.name}
    showPath={searching}
    opening={openingId === item.id || downloadingIds.includes(item.id)}
    disabled={openingId !== null || downloadingIds.includes(item.id)}
    onPress={open}
  />, [downloadingIds, itemWidth, open, openingId, searching, sources]);

  const listHeader = <LibraryHeader
    query={query}
    format={format}
    allActive={allActive}
    advancedFilterCount={advancedFilterCount}
    error={error}
    mode={mode}
    downloadNotice={downloadNotice}
    location={activeLocation}
    sourceName={sourceAtLocation?.name}
    breadcrumbParts={breadcrumbParts}
    sort={sort}
    searching={searching}
    visibleBookCount={visibleBooks.length}
    visibleFolders={visibleFolders}
    sources={sources}
    folderWidth={folderWidth}
    onQueryChange={setQuery}
    onShowAll={showAll}
    onFormatChange={(value) => setFormat((current) => current === value ? 'all' : value)}
    onOpenFilters={() => setFiltersOpen(true)}
    onRetry={() => { clearError(); void sync().catch(() => undefined); }}
    onClearError={clearError}
    onDismissDownloadNotice={() => setDownloadNotice(null)}
    onNavigate={setLocation}
  />;

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
      renderItem={renderBook}
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

const styles = StyleSheet.create({
  content: { width: '100%', alignSelf: 'center', paddingBottom: 36 },
  contentEmpty: { flexGrow: 1 },
  bookRow: { gap: GRID_GAP },
});
