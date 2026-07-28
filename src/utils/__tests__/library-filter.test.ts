import type { LibraryItem } from '@/domain/models';
import {
  libraryBreadcrumbs,
  libraryFolderContents,
  libraryFolders,
  matchesLibraryItem,
  parentLibraryLocation,
  sortLibraryItems,
} from '../library-filter';

const item: LibraryItem = {
  id: '1', sourceId: 'source', sourceKind: 'drive', providerKey: 'file', format: 'epub',
  name: 'cien.epub', title: 'Cien años de soledad', author: 'Gabriel García Márquez',
  series: 'Grandes novelas', seriesNumber: '2', publisher: 'Editorial Sur', publishedAt: '1967-05-30',
  language: 'es', subjects: ['Realismo mágico', 'Latinoamérica'], pageCount: 471, metadataExtracted: true,
  coverExtractionVersion: 1,
  relativePath: 'Novelas/Latinoamérica/cien.epub', mimeType: null, size: null, modifiedAt: '2026-01-01T00:00:00.000Z',
  coverUri: null, localUri: null, available: true, downloadStatus: 'none', downloadProgress: 0,
  status: 'reading', progress: 0.4, updatedAt: '2026-01-01T00:00:00.000Z',
};

const filter = {
  query: '', format: 'all', source: 'all', folder: 'all', status: 'all',
} as const;

describe('library filters', () => {
  it('combines accent-insensitive metadata search, format, source, folder, and reading state', () => {
    expect(matchesLibraryItem(item, {
      query: 'garcia realismo 1967', format: 'epub', source: 'drive', folder: 'Novelas', status: 'reading',
      series: 'GRANDES NOVELAS', language: 'ES', subject: 'realismo magico',
    })).toBe(true);
    expect(matchesLibraryItem(item, { ...filter, format: 'pdf' })).toBe(false);
    expect(matchesLibraryItem(item, { ...filter, source: 'local' })).toBe(false);
    expect(matchesLibraryItem(item, { ...filter, folder: 'Novel' })).toBe(false);
  });

  it('builds stable nested folder choices', () => {
    expect(libraryFolders([item, { ...item, id: '2', relativePath: 'Zeta/two.pdf' }])).toEqual([
      'Novelas/Latinoamérica', 'Zeta',
    ]);
  });
});

describe('library sorting', () => {
  it('sorts series and issue numbers naturally, with missing metadata last', () => {
    const values = [
      { ...item, id: 'none', title: 'Independent', series: null, seriesNumber: null },
      { ...item, id: 'ten', title: 'Ten', seriesNumber: '10' },
      { ...item, id: 'one', title: 'One', seriesNumber: '1' },
    ];
    expect(sortLibraryItems(values, 'series').map((value) => value.id)).toEqual(['one', 'ten', 'none']);
  });

  it('sorts modified items newest first and leaves unknown dates last', () => {
    const values = [
      { ...item, id: 'old', modifiedAt: '2025-01-01T00:00:00.000Z' },
      { ...item, id: 'unknown', modifiedAt: null },
      { ...item, id: 'new', modifiedAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(sortLibraryItems(values, 'modified').map((value) => value.id)).toEqual(['new', 'old', 'unknown']);
  });

  it('sorts reading progress descending and breaks ties by title', () => {
    const values = [
      { ...item, id: 'low', title: 'Low', progress: 0.1 },
      { ...item, id: 'zeta', title: 'Zeta', progress: 0.8 },
      { ...item, id: 'alpha', title: 'Alpha', progress: 0.8 },
    ];
    expect(sortLibraryItems(values, 'progress').map((value) => value.id)).toEqual(['alpha', 'zeta', 'low']);
  });
});

describe('library folders', () => {
  const sameFolderOtherSource = { ...item, id: '2', sourceId: 'other-source', providerKey: 'other-file' };
  const directBook = { ...item, id: '3', providerKey: 'direct', relativePath: 'Novelas/direct.epub' };
  const deeperBook = { ...item, id: '4', providerKey: 'deeper', relativePath: 'Novelas/Latinoamérica/Clásicos/deeper.epub' };

  it('keeps same-named physical folders separate by source at the root', () => {
    const contents = libraryFolderContents([item, sameFolderOtherSource], { sourceId: null, path: '' });
    expect(contents.items).toEqual([]);
    expect(contents.folders).toHaveLength(2);
    expect(contents.folders.map((folder) => folder.name)).toEqual(['Novelas', 'Novelas']);
    expect(new Set(contents.folders.map((folder) => folder.key)).size).toBe(2);
  });

  it('returns only direct files and immediate child folders for a location', () => {
    const contents = libraryFolderContents([item, sameFolderOtherSource, directBook, deeperBook], {
      sourceId: 'source', path: 'Novelas',
    });
    expect(contents.items.map((value) => value.id)).toEqual(['3']);
    expect(contents.folders).toEqual([
      expect.objectContaining({ sourceId: 'source', path: 'Novelas/Latinoamérica', name: 'Latinoamérica', itemCount: 2 }),
    ]);
  });

  it('builds breadcrumbs and navigates to the parent without leaking source scope', () => {
    const location = { sourceId: 'source', path: 'Novelas/Latinoamérica/Clásicos' };
    expect(libraryBreadcrumbs(location)).toEqual([
      { name: 'Novelas', path: 'Novelas' },
      { name: 'Latinoamérica', path: 'Novelas/Latinoamérica' },
      { name: 'Clásicos', path: 'Novelas/Latinoamérica/Clásicos' },
    ]);
    expect(parentLibraryLocation(location)).toEqual({ sourceId: 'source', path: 'Novelas/Latinoamérica' });
    expect(parentLibraryLocation({ sourceId: 'source', path: 'Novelas' })).toEqual({ sourceId: null, path: '' });
  });
});
