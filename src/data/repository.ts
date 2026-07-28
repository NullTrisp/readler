import { randomUUID } from 'expo-crypto';

import type {
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
  relative_path: string;
  mime_type: string | null;
  size: number | null;
  modified_at: string | null;
  cover_uri: string | null;
  local_uri: string | null;
  available: number;
  updated_at: string;
  download_status: LibraryItem['downloadStatus'] | null;
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
      const existing = await database.getFirstAsync<{ id: string; local_uri: string | null }>(
        'SELECT id, local_uri FROM library_items WHERE source_id = ? AND provider_key = ?',
        source.id,
        item.providerKey,
      );
      await database.runAsync(
        `INSERT INTO library_items(id, source_id, provider_key, format, name, title, author,
          relative_path, mime_type, size, modified_at, cover_uri, local_uri, available, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(source_id, provider_key) DO UPDATE SET format=excluded.format, name=excluded.name,
          title=excluded.title, author=excluded.author, relative_path=excluded.relative_path,
          mime_type=excluded.mime_type, size=excluded.size, modified_at=excluded.modified_at,
          cover_uri=COALESCE(excluded.cover_uri, library_items.cover_uri),
          local_uri=COALESCE(excluded.local_uri, library_items.local_uri), available=1,
          updated_at=excluded.updated_at`,
        existing?.id ?? randomUUID(),
        source.id,
        item.providerKey,
        item.format,
        item.name,
        item.title ?? item.name.replace(/\.[^.]+$/, ''),
        item.author ?? null,
        item.relativePath,
        item.mimeType ?? null,
        item.size ?? null,
        item.modifiedAt ?? null,
        item.coverUri ?? null,
        item.localUri ?? existing?.local_uri ?? null,
        scannedAt,
      );
    }
  });
}

function mapLibraryRow(row: LibraryRow): LibraryItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKind: row.source_kind,
    providerKey: row.provider_key,
    format: row.format,
    name: row.name,
    title: row.title,
    author: row.author,
    relativePath: row.relative_path,
    mimeType: row.mime_type,
    size: row.size,
    modifiedAt: row.modified_at,
    coverUri: row.cover_uri,
    localUri: row.local_uri,
    available: Boolean(row.available),
    downloadStatus: row.download_status ?? (row.source_kind === 'drive' ? 'none' : 'ready'),
    downloadProgress: row.download_progress ?? 0,
    status: row.reading_status ?? 'unread',
    progress: row.reading_percent ?? 0,
    updatedAt: row.updated_at,
  };
}

const LIBRARY_SELECT = `SELECT i.*, s.kind AS source_kind,
  d.status AS download_status,
  CASE WHEN d.total_bytes > 0 THEN CAST(d.bytes_written AS REAL) / d.total_bytes ELSE 0 END AS download_progress,
  p.status AS reading_status, p.percent AS reading_percent
  FROM library_items i JOIN sources s ON s.id=i.source_id
  LEFT JOIN downloads d ON d.item_id=i.id LEFT JOIN reading_progress p ON p.item_id=i.id`;

export async function listLibrary(filter: LibraryFilter = {}) {
  const database = await getDatabase();
  const where = ['i.available = 1'];
  const args: string[] = [];
  if (filter.query) {
    where.push('(i.title LIKE ? OR i.author LIKE ? OR i.relative_path LIKE ?)');
    const query = `%${filter.query}%`;
    args.push(query, query, query);
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
    args.push(`${filter.folder}%`);
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
  metadata: { title?: string | null; author?: string | null; coverUri?: string | null },
) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE library_items SET title=COALESCE(?, title), author=COALESCE(?, author),
     cover_uri=COALESCE(?, cover_uri), updated_at=? WHERE id=?`,
    metadata.title || null,
    metadata.author || null,
    metadata.coverUri || null,
    now(),
    id,
  );
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
