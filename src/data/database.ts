import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'readler.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await migrate(database);
      return database;
    });
  }
  return databasePromise;
}

export async function migrate(database: SQLite.SQLiteDatabase) {
  const result = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((result?.user_version ?? 0) >= 1) return;

  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        root_ref TEXT,
        account_id TEXT,
        created_at TEXT NOT NULL,
        last_scan_at TEXT
      );
      CREATE TABLE IF NOT EXISTS library_items (
        id TEXT PRIMARY KEY NOT NULL,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        provider_key TEXT NOT NULL,
        format TEXT NOT NULL,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        relative_path TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        modified_at TEXT,
        cover_uri TEXT,
        local_uri TEXT,
        available INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        UNIQUE(source_id, provider_key)
      );
      CREATE INDEX IF NOT EXISTS library_items_source_idx ON library_items(source_id);
      CREATE INDEX IF NOT EXISTS library_items_title_idx ON library_items(title COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS reading_progress (
        item_id TEXT PRIMARY KEY NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
        provider_key TEXT NOT NULL,
        locator_json TEXT NOT NULL,
        percent REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unread',
        updated_at TEXT NOT NULL,
        installation_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
        provider_key TEXT NOT NULL,
        locator_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        installation_id TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS bookmarks_item_idx ON bookmarks(item_id);
      CREATE TABLE IF NOT EXISTS downloads (
        item_id TEXT PRIMARY KEY NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        local_uri TEXT,
        bytes_written INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        resume_data TEXT,
        error TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      PRAGMA user_version = 1;
    `);
  });
}
