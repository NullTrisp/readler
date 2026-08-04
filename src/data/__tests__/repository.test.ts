import type { ContentSourceRecord, ScanItem } from '@/domain/models';
import { getDatabase } from '../database';
import { getLibraryItem, listLibrary, replaceSourceItems, updateItemMetadata } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-item-id' }));
jest.mock('../database', () => ({ getDatabase: jest.fn() }));

const database = {
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn(),
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
};

const source: ContentSourceRecord = {
  id: 'source-1', kind: 'android-folder', name: 'Comics', rootRef: 'folder://comics', accountId: null,
  createdAt: '2026-01-01T00:00:00.000Z', lastScanAt: null,
};

const scanItem: ScanItem = {
  providerKey: 'file-1', format: 'cbz', name: 'Issue 1.cbz', relativePath: 'Series/Issue 1.cbz',
  mimeType: 'application/zip', size: 100, modifiedAt: '2026-01-01T00:00:00.000Z', localUri: 'file://issue.cbz',
};

const existing = {
  id: 'existing-id', title: 'Extracted title', author: 'Writer', series: 'Series', series_number: '1',
  publisher: 'Publisher', published_at: '2025-02-03', language: 'en', subjects_json: '["Adventure"]',
  page_count: 24, metadata_extracted: 1, cover_extraction_version: 1,
  size: 100, modified_at: '2026-01-01T00:00:00.000Z',
  cover_uri: 'file://cover.jpg', local_uri: 'file://issue.cbz',
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDatabase as jest.Mock).mockResolvedValue(database);
  database.runAsync.mockResolvedValue(undefined);
  database.getAllAsync.mockResolvedValue([]);
  database.withTransactionAsync.mockImplementation(async (operation: () => Promise<void>) => operation());
});

function libraryUpsert() {
  const call = database.runAsync.mock.calls.find(([sql]) =>
    typeof sql === 'string' && sql.includes('INSERT INTO library_items'));
  if (!call) throw new Error('Expected a library_items upsert');
  return call as [string, ...unknown[]];
}

describe('library item scans', () => {
  it('preserves extracted metadata and cover when the content fingerprint is unchanged', async () => {
    database.getFirstAsync.mockResolvedValue(existing);

    await replaceSourceItems(source, [scanItem]);

    const [sql, ...args] = libraryUpsert();
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
    expect(args[5]).toBe('Extracted title');
    expect(args[6]).toBe('Writer');
    expect(args[7]).toBe('Series');
    expect(args[8]).toBe('1');
    expect(args[12]).toBe('["Adventure"]');
    expect(args[13]).toBe(24);
    expect(args[14]).toBe(1);
    expect(args[15]).toBe(1);
    expect(args[20]).toBe('file://cover.jpg');
  });

  it('does not replace an extracted cover with a provisional source thumbnail', async () => {
    database.getFirstAsync.mockResolvedValue(existing);

    await replaceSourceItems(source, [{ ...scanItem, coverUri: 'https://drive.example/thumbnail' }]);

    const [, ...args] = libraryUpsert();
    expect(args[15]).toBe(1);
    expect(args[20]).toBe('file://cover.jpg');
  });

  it('resets extracted metadata and stale cover when size or modifiedAt changes', async () => {
    database.getFirstAsync.mockResolvedValue(existing);

    await replaceSourceItems(source, [{
      ...scanItem, size: 101, modifiedAt: '2026-02-01T00:00:00.000Z',
    }]);

    const [, ...args] = libraryUpsert();
    expect(args[5]).toBe('Issue 1');
    expect(args[6]).toBeNull();
    expect(args[7]).toBeNull();
    expect(args[12]).toBe('[]');
    expect(args[13]).toBeNull();
    expect(args[14]).toBe(0);
    expect(args[15]).toBe(0);
    expect(args[20]).toBeNull();
  });
});

describe('metadata updates and search', () => {
  it('maps normalized metadata and treats a persisted local file as ready', async () => {
    database.getFirstAsync.mockResolvedValue({
      id: 'item-1', source_id: 'source-1', source_kind: 'drive', provider_key: 'file-1', format: 'cbz',
      name: 'Issue 1.cbz', title: 'Issue 1', author: 'Writer', series: 'Series', series_number: '1',
      publisher: 'Publisher', published_at: '2025-02-03', language: 'en', subjects_json: '["Adventure"]',
      page_count: 24, metadata_extracted: 1, cover_extraction_version: 1,
      relative_path: 'Series/Issue 1.cbz', mime_type: 'application/zip',
      size: 100, modified_at: '2026-01-01T00:00:00.000Z', cover_uri: 'file://cover.jpg',
      local_uri: 'file://downloads/item-1.cbz', download_local_uri: null, available: 1,
      updated_at: '2026-01-01T00:00:00.000Z',
      download_status: 'downloading', download_progress: 1, reading_status: null, reading_percent: null,
    });

    await expect(getLibraryItem('item-1')).resolves.toEqual(expect.objectContaining({
      series: 'Series', seriesNumber: '1', publisher: 'Publisher', publishedAt: '2025-02-03',
      language: 'en', subjects: ['Adventure'], pageCount: 24, metadataExtracted: true,
      coverExtractionVersion: 1, localUri: 'file://downloads/item-1.cbz',
      downloadStatus: 'ready', downloadProgress: 1,
    }));
  });

  it('only changes metadata_extracted when the caller sets it explicitly', async () => {
    await updateItemMetadata('item-1', { title: 'Reader title', author: 'Reader author' });
    expect(database.runAsync.mock.calls[0][0]).not.toContain('metadata_extracted');

    database.runAsync.mockClear();
    await updateItemMetadata('item-1', { metadataExtracted: true });
    expect(database.runAsync.mock.calls[0][0]).toContain('metadata_extracted=?');
    expect(database.runAsync.mock.calls[0][1]).toBe(1);
  });

  it('can clear a stale cover while recording the extraction version', async () => {
    await updateItemMetadata('item-1', { coverUri: null, coverExtractionVersion: 1 });
    const [sql, ...args] = database.runAsync.mock.calls[0];
    expect(sql).toContain('cover_uri=?');
    expect(sql).toContain('cover_extraction_version=?');
    expect(args[0]).toBeNull();
    expect(args[1]).toBe(1);
  });

  it('guards background metadata writes with the source fingerprint', async () => {
    await updateItemMetadata('item-1', { coverUri: 'data:image/jpeg;base64,cover' }, {
      providerKey: 'file-1',
      size: 100,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    });
    const [sql, ...args] = database.runAsync.mock.calls[0];
    expect(sql).toContain('WHERE id=? AND provider_key=? AND size IS ? AND modified_at IS ?');
    expect(args.slice(-4)).toEqual([
      'item-1',
      'file-1',
      100,
      '2026-01-01T00:00:00.000Z',
    ]);
  });

  it('searches normalized metadata columns as well as title and path', async () => {
    await listLibrary({ query: 'adventure' });
    const [sql, args] = database.getAllAsync.mock.calls[0];
    expect(sql).toContain('i.series LIKE ?');
    expect(sql).toContain('i.publisher LIKE ?');
    expect(sql).toContain('i.published_at LIKE ?');
    expect(sql).toContain('i.language LIKE ?');
    expect(sql).toContain('i.subjects_json LIKE ?');
    expect(sql).toContain('CAST(i.page_count AS TEXT) LIKE ?');
    expect(args).toHaveLength(10);
    expect(args).toEqual(Array(10).fill('%adventure%'));
  });
});
