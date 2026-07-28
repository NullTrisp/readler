import type { ContentFormat, LibraryItem, ReadingStatus } from '@/domain/models';

export interface VisibleLibraryFilter {
  query: string;
  format: ContentFormat | 'all';
  status: ReadingStatus | 'all';
  source: 'all' | 'drive' | 'local';
  folder: string | 'all';
}

export function matchesLibraryItem(item: LibraryItem, filter: VisibleLibraryFilter) {
  if (filter.format !== 'all' && item.format !== filter.format) return false;
  if (filter.status !== 'all' && item.status !== filter.status) return false;
  if (filter.source === 'drive' && item.sourceKind !== 'drive') return false;
  if (filter.source === 'local' && item.sourceKind === 'drive') return false;
  if (filter.folder !== 'all' && !item.relativePath.startsWith(`${filter.folder}/`)) return false;
  const query = filter.query.trim().toLocaleLowerCase();
  return !query || `${item.title} ${item.author ?? ''} ${item.relativePath}`.toLocaleLowerCase().includes(query);
}

export function libraryFolders(items: LibraryItem[]) {
  return Array.from(new Set(
    items.map((item) => item.relativePath.split('/').slice(0, -1).join('/')).filter(Boolean),
  )).sort((a, b) => a.localeCompare(b));
}
