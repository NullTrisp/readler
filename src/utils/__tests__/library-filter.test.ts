import type { LibraryItem } from '@/domain/models';
import { libraryFolders, matchesLibraryItem } from '../library-filter';

const item: LibraryItem = {
  id: '1', sourceId: 'source', sourceKind: 'drive', providerKey: 'file', format: 'epub',
  name: 'cien.epub', title: 'Cien años de soledad', author: 'Gabriel García Márquez',
  relativePath: 'Novelas/Latinoamérica/cien.epub', mimeType: null, size: null, modifiedAt: null,
  coverUri: null, localUri: null, available: true, downloadStatus: 'none', downloadProgress: 0,
  status: 'reading', progress: 0.4, updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('library filters', () => {
  it('combines Unicode search, format, source, folder, and reading state', () => {
    expect(matchesLibraryItem(item, { query: 'GARCÍA', format: 'epub', source: 'drive', folder: 'Novelas', status: 'reading' })).toBe(true);
    expect(matchesLibraryItem(item, { query: '', format: 'pdf', source: 'drive', folder: 'Novelas', status: 'reading' })).toBe(false);
    expect(matchesLibraryItem(item, { query: '', format: 'all', source: 'local', folder: 'all', status: 'all' })).toBe(false);
  });

  it('builds stable nested folder choices', () => {
    expect(libraryFolders([item, { ...item, id: '2', relativePath: 'Zeta/two.pdf' }])).toEqual([
      'Novelas/Latinoamérica', 'Zeta',
    ]);
  });
});
