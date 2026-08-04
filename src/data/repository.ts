import { randomUUID } from 'expo-crypto';

import type {
  BookMetadata,
  Bookmark,
  ContentSourceRecord,
  DownloadRecord,
  LibraryFilter,
  LibraryItem,
  ReadingLocator,
  ReadingProgress,
  ScanItem,
} from '@/domain/models';
import { getDatabase } from './database';
import { compareVersions } from '@/utils/sync-merge';

type LibraryRow = {
  id: string;
  source_id: string;
  source_kind: LibraryItem['sourceKind'];
  provider_key: string;
  format: LibraryItem['format'];
  name: string;
  title: string;
  author: string | null;
  series: string | null;
  series_number: string | null;
  publisher: string | null;
  published_at: string | null;
  language: string | null;
  subjects_json: string;
  page_count: number | null;
  metadata_extracted: number;
  cover_extraction_version: number;
  relative_path: string;
  mime_type: string | null;
  size: number | null;
  modified_at: string | null;
  cover_uri: string | null;
  local_uri: string | null;
  available: number;
  updated_at: string;
  download_status: LibraryItem['downloadStatus'] | null;
  download_local_uri: string | null;
  download_progress: number | null;
  reading_status: LibraryItem['status'] | null;
  reading_percent: number | null;
};

const now = () => new Date().toISOString();

export async function getInstallationId() {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'installationId'",
  );
  if (row) return row.value;
  const value = randomUUID();
  await database.runAsync('INSERT INTO app_settings(key, value) VALUES (?, ?)', 'installationId', value);
  return value;
}

export async function saveSource(source: ContentSourceRecord) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO sources(id, kind, name, root_ref, account_id, created_at, last_scan_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, root_ref=excluded.root_ref,
       account_id=excluded.account_id, last_scan_at=excluded.last_scan_at`,
    source.id,
    source.kind,
    source.name,
    source.rootRef,
    source.accountId,
    source.createdAt,
    source.lastScanAt,
  );
}

export async function listSources() {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    kind: ContentSourceRecord['kind'];
    name: string;
    root_ref: string | null;
    account_id: string | null;
    created_at: string;
    last_scan_at: string | null;
  }>('SELECT * FROM sources ORDER BY created_at');
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    rootRef: row.root_ref,
    accountId: row.account_id,
    createdAt: row.created_at,
    lastScanAt: row.last_scan_at,
  }));
}

export async function removeSource(id: string) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM sources WHERE id = ?', id);
}

export async function replaceSourceItems(source: ContentSourceRecord, items: ScanItem[]) {
  const database = await getDatabase();
  const scannedAt = now();
  await database.withTransactionAsync(async () => {
    await saveSource({ ...source, lastScanAt: scannedAt });
    await database.runAsync('UPDATE library_items SET available = 0 WHERE source_id = ?', source.id);
    for (const item of items) {
      const existing = await database.getFirstAsync<Pick<LibraryRow,
        'id' | 'title' | 'author' | 'series' | 'series_number' | 'publisher' | 'published_at' |
        'language' | 'subjects_json' | 'page_count' | 'metadata_extracted' | 'cover_extraction_version' | 'size' | 'modified_at' |
        'cover_uri' | 'local_uri'
      >>(
        `SELECT id, title, author, series, series_number, publisher, published_at, language,
          subjects_json, page_count, metadata_extracted, cover_extraction_version, size, modified_at,
          cover_uri, local_uri
         FROM library_items WHERE source_id = ? AND provider_key = ?`,
        source.id,
        item.providerKey,
      );
      const size = item.size ?? null;
      const modifiedAt = item.modifiedAt ?? null;
      const contentUnchanged = Boolean(existing) && existing?.size === size && existing.modified_at === modifiedAt;
      const incomingMetadata = item.metadataExtracted === true;
      const preserveMetadata = contentUnchanged && Boolean(existing?.metadata_extracted) && !incomingMetadata;
      const incomingCoverVersion = Math.max(0, Math.floor(item.coverExtractionVersion ?? 0));
      const existingCoverVersion = existing?.cover_extraction_version ?? 0;
      const preserveExtractedCover = contentUnchanged && existingCoverVersion > incomingCoverVersion;
      const title = preserveMetadata
        ? existing!.title
        : item.title?.trim() || item.name.replace(/\.[^.]+$/, '');
      const author = preserveMetadata ? existing!.author : item.author ?? null;
      const series = preserveMetadata ? existing!.series : item.series ?? null;
      const seriesNumber = preserveMetadata ? existing!.series_number : item.seriesNumber ?? null;
      const publisher = preserveMetadata ? existing!.publisher : item.publisher ?? null;
      const publishedAt = preserveMetadata ? existing!.published_at : item.publishedAt ?? null;
      const language = preserveMetadata ? existing!.language : item.language ?? null;
      const subjectsJson = preserveMetadata ? existing!.subjects_json : serializeSubjects(item.subjects);
      const pageCount = preserveMetadata ? existing!.page_count : item.pageCount ?? null;
      const metadataExtracted = incomingMetadata || preserveMetadata;
      const coverExtractionVersion = preserveExtractedCover ? existingCoverVersion : incomingCoverVersion;
      const coverUri = preserveExtractedCover
        ? existing?.cover_uri ?? null
        : contentUnchanged
          ? item.coverUri ?? existing?.cover_uri ?? null
          : item.coverUri ?? null;
      await database.runAsync(
        `INSERT INTO library_items(id, source_id, provider_key, format, name, title, author,
          series, series_number, publisher, published_at, language, subjects_json, page_count,
          metadata_extracted, cover_extraction_version, relative_path, mime_type, size, modified_at,
          cover_uri, local_uri, available, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(source_id, provider_key) DO UPDATE SET format=excluded.format, name=excluded.name,
          title=excluded.title, author=excluded.author, series=excluded.series,
          series_number=excluded.series_number, publisher=excluded.publisher,
          published_at=excluded.published_at, language=excluded.language,
          subjects_json=excluded.subjects_json, page_count=excluded.page_count,
          metadata_extracted=excluded.metadata_extracted,
          cover_extraction_version=excluded.cover_extraction_version,
          relative_path=excluded.relative_path,
          mime_type=excluded.mime_type, size=excluded.size, modified_at=excluded.modified_at,
          cover_uri=excluded.cover_uri,
          local_uri=COALESCE(excluded.local_uri, library_items.local_uri), available=1,
          updated_at=excluded.updated_at`,
        existing?.id ?? randomUUID(),
        source.id,
        item.providerKey,
        item.format,
        item.name,
        title,
        author,
        series,
        seriesNumber,
        publisher,
        publishedAt,
        language,
        subjectsJson,
        pageCount,
        metadataExtracted ? 1 : 0,
        coverExtractionVersion,
        item.relativePath,
        item.mimeType ?? null,
        size,
        modifiedAt,
        coverUri,
        item.localUri ?? existing?.local_uri ?? null,
        scannedAt,
      );
    }
  });
}

function mapLibraryRow(row: LibraryRow): LibraryItem {
  const localUri = row.download_local_uri ?? row.local_uri;
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKind: row.source_kind,
    providerKey: row.provider_key,
    format: row.format,
    name: row.name,
    title: row.title,
    author: row.author,
    series: row.series,
    seriesNumber: row.series_number,
    publisher: row.publisher,
    publishedAt: row.published_at,
    language: row.language,
    subjects: parseSubjects(row.subjects_json),
    pageCount: row.page_count,
    metadataExtracted: Boolean(row.metadata_extracted),
    coverExtractionVersion: row.cover_extraction_version ?? 0,
    relativePath: row.relative_path,
    mimeType: row.mime_type,
    size: row.size,
    modifiedAt: row.modified_at,
    coverUri: row.cover_uri,
    localUri,
    available: Boolean(row.available),
    downloadStatus: localUri ? 'ready' : row.download_status ?? (row.source_kind === 'drive' ? 'none' : 'ready'),
    downloadProgress: localUri ? 1 : row.download_progress ?? 0,
    status: row.reading_status ?? 'unread',
    progress: row.reading_percent ?? 0,
    updatedAt: row.updated_at,
  };
}

const LIBRARY_SELECT = `SELECT i.*, s.kind AS source_kind,
  d.status AS download_status,
  d.local_uri AS download_local_uri,
  CASE WHEN d.total_bytes > 0 THEN CAST(d.bytes_written AS REAL) / d.total_bytes ELSE 0 END AS download_progress,
  p.status AS reading_status, p.percent AS reading_percent
  FROM library_items i JOIN sources s ON s.id=i.source_id
  LEFT JOIN downloads d ON d.item_id=i.id LEFT JOIN reading_progress p ON p.item_id=i.id`;

export async function listLibrary(filter: LibraryFilter = {}) {
  const database = await getDatabase();
  const where = ['i.available = 1'];
  const args: string[] = [];
  if (filter.query) {
    where.push(`(i.title LIKE ? OR i.author LIKE ? OR i.series LIKE ? OR i.series_number LIKE ?
      OR i.publisher LIKE ? OR i.published_at LIKE ? OR i.language LIKE ? OR i.subjects_json LIKE ?
      OR CAST(i.page_count AS TEXT) LIKE ? OR i.relative_path LIKE ?)`);
    const query = `%${filter.query}%`;
    args.push(query, query, query, query, query, query, query, query, query, query);
  }
  if (filter.format && filter.format !== 'all') {
    where.push('i.format = ?');
    args.push(filter.format);
  }
  if (filter.sourceKind && filter.sourceKind !== 'all') {
    where.push('s.kind = ?');
    args.push(filter.sourceKind);
  }
  if (filter.status && filter.status !== 'all') {
    where.push("COALESCE(p.status, 'unread') = ?");
    args.push(filter.status);
  }
  if (filter.folder && filter.folder !== 'all') {
    where.push('i.relative_path LIKE ?');
    args.push(`${filter.folder.replace(/\/$/, '')}/%`);
  }
  if (filter.author && filter.author !== 'all') {
    where.push('i.author = ? COLLATE NOCASE');
    args.push(filter.author);
  }
  if (filter.series && filter.series !== 'all') {
    where.push('i.series = ? COLLATE NOCASE');
    args.push(filter.series);
  }
  if (filter.language && filter.language !== 'all') {
    where.push('i.language = ? COLLATE NOCASE');
    args.push(filter.language);
  }
  if (filter.subject && filter.subject !== 'all') {
    where.push('i.subjects_json LIKE ?');
    args.push(`%${JSON.stringify(filter.subject)}%`);
  }
  const rows = await database.getAllAsync<LibraryRow>(
    `${LIBRARY_SELECT} WHERE ${where.join(' AND ')} ORDER BY i.title COLLATE NOCASE`,
    args,
  );
  return rows.map(mapLibraryRow);
}

export async function getLibraryItem(id: string) {
  const database = await getDatabase();
  const row = await database.getFirstAsync<LibraryRow>(`${LIBRARY_SELECT} WHERE i.id = ?`, id);
  return row ? mapLibraryRow(row) : null;
}

export async function updateItemMetadata(
  id: string,
  metadata: Partial<BookMetadata> & {
    coverUri?: string | null;
    metadataExtracted?: boolean;
    coverExtractionVersion?: number;
  },
  expectedFingerprint?: Pick<LibraryItem, 'providerKey' | 'size' | 'modifiedAt'>,
) {
  const database = await getDatabase();
  const updates: string[] = [];
  const args: (string | number | null)[] = [];
  const has = <Key extends keyof typeof metadata>(key: Key) => Object.prototype.hasOwnProperty.call(metadata, key);
  const set = (column: string, value: string | number | null) => { updates.push(`${column}=?`); args.push(value); };

  if (typeof metadata.title === 'string' && metadata.title.trim()) set('title', metadata.title.trim());
  if (has('author')) set('author', metadata.author?.trim() || null);
  if (has('series')) set('series', metadata.series?.trim() || null);
  if (has('seriesNumber')) set('series_number', metadata.seriesNumber?.trim() || null);
  if (has('publisher')) set('publisher', metadata.publisher?.trim() || null);
  if (has('publishedAt')) set('published_at', metadata.publishedAt?.trim() || null);
  if (has('language')) set('language', metadata.language?.trim() || null);
  if (has('subjects')) set('subjects_json', serializeSubjects(metadata.subjects));
  if (has('pageCount')) set('page_count', metadata.pageCount ?? null);
  if (has('coverUri')) set('cover_uri', typeof metadata.coverUri === 'string' && metadata.coverUri ? metadata.coverUri : null);

  if (has('metadataExtracted')) set('metadata_extracted', metadata.metadataExtracted ? 1 : 0);
  if (has('coverExtractionVersion')) {
    set('cover_extraction_version', Math.max(0, Math.floor(metadata.coverExtractionVersion ?? 0)));
  }
  if (!updates.length) return;
  updates.push('updated_at=?');
  args.push(now(), id);
  let where = 'id=?';
  if (expectedFingerprint) {
    where += ' AND provider_key=? AND size IS ? AND modified_at IS ?';
    args.push(expectedFingerprint.providerKey, expectedFingerprint.size, expectedFingerprint.modifiedAt);
  }
  await database.runAsync(`UPDATE library_items SET ${updates.join(', ')} WHERE ${where}`, ...args);
}

function serializeSubjects(subjects: readonly string[] | null | undefined) {
  const normalized = Array.from(new Set((subjects ?? []).map((subject) => subject.trim()).filter(Boolean)));
  return JSON.stringify(normalized);
}

function parseSubjects(value: string | null | undefined) {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((subject): subject is string => typeof subject === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveProgress(item: LibraryItem, locator: ReadingLocator, percent: number) {
  const database = await getDatabase();
  const installationId = await getInstallationId();
  const updatedAt = now();
  const status = percent >= 0.995 ? 'finished' : percent > 0 ? 'reading' : 'unread';
  await database.runAsync(
    `INSERT INTO reading_progress(item_id, provider_key, locator_json, percent, status, updated_at, installation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET locator_json=excluded.locator_json,
     percent=excluded.percent, status=excluded.status, updated_at=excluded.updated_at,
     installation_id=excluded.installation_id`,
    item.id,
    item.providerKey,
    JSON.stringify(locator),
    percent,
    status,
    updatedAt,
    installationId,
  );
}

export async function getProgress(itemId: string) {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    provider_key: string;
    locator_json: string;
    percent: number;
    status: ReadingProgress['status'];
    updated_at: string;
    installation_id: string;
  }>('SELECT * FROM reading_progress WHERE item_id = ?', itemId);
  return row
    ? ({
        itemId,
        providerKey: row.provider_key,
        locator: JSON.parse(row.locator_json) as ReadingLocator,
        percent: row.percent,
        status: row.status,
        updatedAt: row.updated_at,
        installationId: row.installation_id,
      } satisfies ReadingProgress)
    : null;
}

export async function listDriveProgress() {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    item_id: string;
    provider_key: string;
    locator_json: string;
    percent: number;
    status: ReadingProgress['status'];
    updated_at: string;
    installation_id: string;
  }>(`SELECT p.* FROM reading_progress p JOIN library_items i ON i.id=p.item_id
      JOIN sources s ON s.id=i.source_id WHERE s.kind='drive'`);
  return rows.map(
    (row) =>
      ({
        itemId: row.item_id,
        providerKey: row.provider_key,
        locator: JSON.parse(row.locator_json),
        percent: row.percent,
        status: row.status,
        updatedAt: row.updated_at,
        installationId: row.installation_id,
      }) as ReadingProgress,
  );
}

export async function listBookmarks(itemId?: string, includeDeleted = false) {
  const database = await getDatabase();
  const where = ['1=1', ...(itemId ? ['item_id = ?'] : []), ...(!includeDeleted ? ['deleted_at IS NULL'] : [])];
  const rows = await database.getAllAsync<{
    id: string;
    item_id: string;
    provider_key: string;
    locator_json: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    installation_id: string;
  }>(`SELECT * FROM bookmarks WHERE ${where.join(' AND ')} ORDER BY created_at`, itemId ? [itemId] : []);
  return rows.map(
    (row) =>
      ({
        id: row.id,
        itemId: row.item_id,
        providerKey: row.provider_key,
        locator: JSON.parse(row.locator_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        installationId: row.installation_id,
      }) as Bookmark,
  );
}

export async function listDriveBookmarks(includeDeleted = true) {
  const database = await getDatabase();
  const deletedClause = includeDeleted ? '' : 'AND b.deleted_at IS NULL';
  const rows = await database.getAllAsync<{
    id: string;
    item_id: string;
    provider_key: string;
    locator_json: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    installation_id: string;
  }>(`SELECT b.* FROM bookmarks b JOIN library_items i ON i.id=b.item_id
      JOIN sources s ON s.id=i.source_id WHERE s.kind='drive' ${deletedClause}`);
  return rows.map(
    (row) =>
      ({
        id: row.id,
        itemId: row.item_id,
        providerKey: row.provider_key,
        locator: JSON.parse(row.locator_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        installationId: row.installation_id,
      }) as Bookmark,
  );
}

export async function toggleBookmark(item: LibraryItem, locator: ReadingLocator) {
  const database = await getDatabase();
  const installationId = await getInstallationId();
  const locatorJson = JSON.stringify(locator);
  const existing = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM bookmarks WHERE item_id=? AND locator_json=? AND deleted_at IS NULL',
    item.id,
    locatorJson,
  );
  const timestamp = now();
  if (existing) {
    await database.runAsync(
      'UPDATE bookmarks SET deleted_at=?, updated_at=?, installation_id=? WHERE id=?',
      timestamp,
      timestamp,
      installationId,
      existing.id,
    );
    return false;
  }
  await database.runAsync(
    `INSERT INTO bookmarks(id, item_id, provider_key, locator_json, created_at, updated_at, deleted_at, installation_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    randomUUID(),
    item.id,
    item.providerKey,
    locatorJson,
    timestamp,
    timestamp,
    installationId,
  );
  return true;
}

export async function upsertRemoteProgress(progress: ReadingProgress) {
  const database = await getDatabase();
  const item = await database.getFirstAsync<{ id: string }>(
    `SELECT i.id FROM library_items i JOIN sources s ON s.id=i.source_id
     WHERE s.kind='drive' AND i.provider_key=?`,
    progress.providerKey,
  );
  if (!item) return;
  const current = await getProgress(item.id);
  if (
    current &&
    compareVersions(current.updatedAt, current.installationId, progress.updatedAt, progress.installationId) >= 0
  )
    return;
  await database.runAsync(
    `INSERT INTO reading_progress(item_id, provider_key, locator_json, percent, status, updated_at, installation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET locator_json=excluded.locator_json,
     percent=excluded.percent, status=excluded.status, updated_at=excluded.updated_at,
     installation_id=excluded.installation_id`,
    item.id,
    progress.providerKey,
    JSON.stringify(progress.locator),
    progress.percent,
    progress.status,
    progress.updatedAt,
    progress.installationId,
  );
}

export async function upsertRemoteBookmark(bookmark: Bookmark) {
  const database = await getDatabase();
  const item = await database.getFirstAsync<{ id: string }>(
    `SELECT i.id FROM library_items i JOIN sources s ON s.id=i.source_id
     WHERE s.kind='drive' AND i.provider_key=?`,
    bookmark.providerKey,
  );
  if (!item) return;
  const current = await database.getFirstAsync<{ updated_at: string; installation_id: string }>(
    'SELECT updated_at, installation_id FROM bookmarks WHERE id=?',
    bookmark.id,
  );
  if (
    current &&
    compareVersions(current.updated_at, current.installation_id, bookmark.updatedAt, bookmark.installationId) >= 0
  )
    return;
  await database.runAsync(
    `INSERT INTO bookmarks(id, item_id, provider_key, locator_json, created_at, updated_at, deleted_at, installation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET item_id=excluded.item_id,
     provider_key=excluded.provider_key, locator_json=excluded.locator_json, updated_at=excluded.updated_at,
     deleted_at=excluded.deleted_at, installation_id=excluded.installation_id`,
    bookmark.id,
    item.id,
    bookmark.providerKey,
    JSON.stringify(bookmark.locator),
    bookmark.createdAt,
    bookmark.updatedAt,
    bookmark.deletedAt,
    bookmark.installationId,
  );
}

export async function saveDownload(record: DownloadRecord) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO downloads(item_id, status, local_uri, bytes_written, total_bytes, resume_data, error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET status=excluded.status,
     local_uri=excluded.local_uri, bytes_written=excluded.bytes_written, total_bytes=excluded.total_bytes,
     resume_data=excluded.resume_data, error=excluded.error, updated_at=excluded.updated_at`,
    record.itemId,
    record.status,
    record.localUri,
    record.bytesWritten,
    record.totalBytes,
    record.resumeData,
    record.error,
    record.updatedAt,
  );
  if (record.localUri)
    await database.runAsync('UPDATE library_items SET local_uri=? WHERE id=?', record.localUri, record.itemId);
  else if (record.status === 'none')
    await database.runAsync('UPDATE library_items SET local_uri=NULL WHERE id=?', record.itemId);
}

export async function getDownload(itemId: string) {
  const database = await getDatabase();
  return database.getFirstAsync<DownloadRecord>(
    `SELECT item_id AS itemId, status, local_uri AS localUri, bytes_written AS bytesWritten,
     total_bytes AS totalBytes, resume_data AS resumeData, error, updated_at AS updatedAt
     FROM downloads WHERE item_id=?`,
    itemId,
  );
}

export async function listDownloads() {
  const database = await getDatabase();
  return database.getAllAsync<DownloadRecord>(
    `SELECT item_id AS itemId, status, local_uri AS localUri, bytes_written AS bytesWritten,
     total_bytes AS totalBytes, resume_data AS resumeData, error, updated_at AS updatedAt
     FROM downloads ORDER BY updated_at DESC`,
  );
}

export async function getSetting(key: string) {
  const database = await getDatabase();
  return (await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', key))
    ?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key,
    value,
  );
}
