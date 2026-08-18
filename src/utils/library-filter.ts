import type { ContentFormat, LibraryItem, ReadingStatus } from '@/domain/models';

export interface VisibleLibraryFilter {
  query: string;
  format: ContentFormat | 'all';
  status: ReadingStatus | 'all';
  folder: string | 'all';
  author?: string | 'all';
  series?: string | 'all';
  language?: string | 'all';
  subject?: string | 'all';
}

export type LibrarySort = 'title' | 'author' | 'series' | 'modified' | 'progress';

export interface LibraryLocation {
  sourceId: string | null;
  path: string;
}

export interface LibraryFolderNode {
  key: string;
  sourceId: string;
  path: string;
  name: string;
  itemCount: number;
}

export interface LibraryBreadcrumb {
  name: string;
  path: string;
}

export interface LibraryFolderContents {
  folders: LibraryFolderNode[];
  items: LibraryItem[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function matchesLibraryItem(item: LibraryItem, filter: VisibleLibraryFilter) {
  if (filter.format !== 'all' && item.format !== filter.format) return false;
  if (filter.status !== 'all' && item.status !== filter.status) return false;
  if (filter.folder !== 'all' && !isItemInsideFolder(item, filter.folder)) return false;
  if (filter.author && filter.author !== 'all' && !sameText(item.author, filter.author)) return false;
  if (filter.series && filter.series !== 'all' && !sameText(item.series, filter.series)) return false;
  if (filter.language && filter.language !== 'all' && !sameText(item.language, filter.language)) return false;
  if (filter.subject && filter.subject !== 'all' && !item.subjects.some((value) => sameText(value, filter.subject!))) {
    return false;
  }

  const terms = normalizeSearch(filter.query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeSearch([
    item.name,
    item.title,
    item.author,
    item.relativePath,
    item.series,
    item.seriesNumber,
    item.publisher,
    item.publishedAt,
    item.language,
    ...item.subjects,
    item.pageCount,
    item.format,
  ].filter((value) => value != null).join(' '));
  return terms.every((term) => haystack.includes(term));
}

export function sortLibraryItems(items: readonly LibraryItem[], sort: LibrarySort = 'title') {
  return [...items].sort((left, right) => {
    if (sort === 'author') {
      return compareOptional(left.author, right.author) || compareText(left.title, right.title) || compareText(left.id, right.id);
    }
    if (sort === 'series') {
      return compareOptional(left.series, right.series) || compareOptional(left.seriesNumber, right.seriesNumber) ||
        compareText(left.title, right.title) || compareText(left.id, right.id);
    }
    if (sort === 'modified') {
      return compareDatesDescending(left.modifiedAt, right.modifiedAt) || compareText(left.title, right.title) ||
        compareText(left.id, right.id);
    }
    if (sort === 'progress') {
      return right.progress - left.progress || compareText(left.title, right.title) || compareText(left.id, right.id);
    }
    return compareText(left.title, right.title) || compareOptional(left.author, right.author) || compareText(left.id, right.id);
  });
}

export function adjacentLibraryItem(items: readonly LibraryItem[], currentId: string, direction: -1 | 1) {
  const current = items.find((item) => item.id === currentId);
  if (!current) return null;
  const folder = folderPathForItem(current);
  const ordered = sortLibraryItems(items.filter((item) =>
    item.sourceId === current.sourceId && folderPathForItem(item) === folder));
  const index = ordered.findIndex((item) => item.id === currentId);
  return ordered[index + direction] ?? null;
}

export function libraryFolders(items: readonly LibraryItem[]) {
  return Array.from(new Set(items.map(folderPathForItem).filter(Boolean))).sort(compareText);
}

export function libraryFolderContents(
  items: readonly LibraryItem[],
  location: LibraryLocation = { sourceId: null, path: '' },
): LibraryFolderContents {
  const currentPath = normalizeFolderPath(location.path);
  const prefix = currentPath ? `${currentPath}/` : '';
  const folders = new Map<string, LibraryFolderNode>();
  const directItems: LibraryItem[] = [];

  for (const item of items) {
    if (location.sourceId && item.sourceId !== location.sourceId) continue;
    const parentPath = folderPathForItem(item);
    if (currentPath && parentPath !== currentPath && !parentPath.startsWith(prefix)) continue;

    const remainder = currentPath ? parentPath.slice(prefix.length) : parentPath;
    if (!remainder) {
      directItems.push(item);
      continue;
    }

    const name = remainder.split('/')[0];
    if (!name) continue;
    const path = currentPath ? `${currentPath}/${name}` : name;
    const key = folderNodeKey(item.sourceId, path);
    const existing = folders.get(key);
    if (existing) existing.itemCount += 1;
    else folders.set(key, { key, sourceId: item.sourceId, path, name, itemCount: 1 });
  }

  return {
    folders: Array.from(folders.values()).sort((left, right) =>
      compareText(left.name, right.name) || compareText(left.sourceId, right.sourceId) || compareText(left.path, right.path)),
    items: directItems,
  };
}

export function libraryBreadcrumbs(location: LibraryLocation): LibraryBreadcrumb[] {
  const segments = normalizeFolderPath(location.path).split('/').filter(Boolean);
  return segments.map((name, index) => ({ name, path: segments.slice(0, index + 1).join('/') }));
}

export function parentLibraryLocation(location: LibraryLocation): LibraryLocation {
  const segments = normalizeFolderPath(location.path).split('/').filter(Boolean);
  segments.pop();
  return { sourceId: segments.length ? location.sourceId : null, path: segments.join('/') };
}

export function folderPathForItem(item: Pick<LibraryItem, 'relativePath'>) {
  const normalized = item.relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalized.split('/').slice(0, -1).join('/');
}

function isItemInsideFolder(item: LibraryItem, folder: string) {
  const path = normalizeFolderPath(folder);
  return !path || item.relativePath.replace(/\\/g, '/').startsWith(`${path}/`);
}

function normalizeFolderPath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function folderNodeKey(sourceId: string, path: string) {
  return `${encodeURIComponent(sourceId)}:${path.split('/').map(encodeURIComponent).join('/')}`;
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function sameText(left: string | null, right: string) {
  return left != null && normalizeSearch(left) === normalizeSearch(right);
}

function compareText(left: string, right: string) {
  return collator.compare(left, right);
}

function compareOptional(left: string | null, right: string | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return compareText(left, right);
}

function compareDatesDescending(left: string | null, right: string | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right.localeCompare(left);
}
