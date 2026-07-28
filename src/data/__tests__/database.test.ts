import type * as SQLite from 'expo-sqlite';

import { migrate } from '../database';

function fakeDatabase(version: number) {
  const execAsync = jest.fn().mockResolvedValue(undefined);
  const database = {
    getFirstAsync: jest.fn().mockResolvedValue({ user_version: version }),
    execAsync,
    withTransactionAsync: jest.fn(async (operation: () => Promise<void>) => operation()),
  } as unknown as SQLite.SQLiteDatabase;
  return { database, execAsync };
}

describe('SQLite migrations', () => {
  it('creates the complete schema and advances through v3 transactionally', async () => {
    const { database, execAsync } = fakeDatabase(0);
    await migrate(database);
    expect(database.withTransactionAsync).toHaveBeenCalledTimes(3);
    const sql = execAsync.mock.calls.map(([statement]) => statement).join('\n') as string;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS library_items');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS reading_progress');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS bookmarks');
    expect(sql).toContain('PRAGMA user_version = 1');
    expect(sql).toContain('ALTER TABLE library_items ADD COLUMN series TEXT');
    expect(sql).toContain('ALTER TABLE library_items ADD COLUMN published_at TEXT');
    expect(sql).toContain("subjects_json TEXT NOT NULL DEFAULT '[]'");
    expect(sql).toContain('metadata_extracted INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('PRAGMA user_version = 2');
    expect(sql).toContain('cover_extraction_version INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain("cover_uri LIKE 'blob:%'");
    expect(sql).toContain('PRAGMA user_version = 3');
  });

  it('upgrades v1 in place without dropping user data tables', async () => {
    const { database, execAsync } = fakeDatabase(1);
    await migrate(database);
    expect(database.withTransactionAsync).toHaveBeenCalledTimes(2);
    const sql = execAsync.mock.calls.map(([statement]) => statement).join('\n') as string;
    expect(sql).toContain('ALTER TABLE library_items ADD COLUMN series TEXT');
    expect(sql).toContain('ALTER TABLE library_items ADD COLUMN cover_extraction_version');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('CREATE TABLE');
    expect(sql).toContain('PRAGMA user_version = 3');
  });

  it('upgrades v2 by adding only the cover extraction version', async () => {
    const { database, execAsync } = fakeDatabase(2);
    await migrate(database);
    expect(database.withTransactionAsync).toHaveBeenCalledTimes(1);
    const sql = execAsync.mock.calls[0][0] as string;
    expect(sql).toContain('ALTER TABLE library_items ADD COLUMN cover_extraction_version');
    expect(sql).toContain("cover_uri LIKE 'blob:%'");
    expect(sql).toContain('PRAGMA user_version = 3');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('does nothing when the schema is current', async () => {
    const { database, execAsync } = fakeDatabase(3);
    await migrate(database);
    expect(database.withTransactionAsync).not.toHaveBeenCalled();
    expect(execAsync).not.toHaveBeenCalled();
  });
});
