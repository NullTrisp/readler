import type { LibraryLocation, LibrarySort } from '@/utils/library-filter';

export type MetadataFilter = string | 'all';

export interface DownloadNotice {
  message: string;
  loading: boolean;
  error?: boolean;
}

export const ROOT_LOCATION: LibraryLocation = { sourceId: null, path: '' };
export const CONTENT_MAX_WIDTH = 1440;
export const GRID_GAP = 12;

export function uniqueMetadata(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b));
}

export function sortLabel(sort: LibrarySort, t: (key: string) => string) {
  if (sort === 'author') return t('sortAuthor');
  if (sort === 'series') return t('sortSeries');
  if (sort === 'modified') return t('sortModified');
  if (sort === 'progress') return t('sortProgress');
  return t('sortTitle');
}
