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
  it('creates the complete v1 schema transactionally', async () => {
    const { database, execAsync } = fakeDatabase(0);
    await migrate(database);
    expect(database.withTransactionAsync).toHaveBeenCalledTimes(1);
    const sql = execAsync.mock.calls[0][0] as string;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS library_items');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS reading_progress');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS bookmarks');
    expect(sql).toContain('PRAGMA user_version = 1');
  });

  it('does nothing when the schema is current', async () => {
    const { database, execAsync } = fakeDatabase(1);
    await migrate(database);
    expect(database.withTransactionAsync).not.toHaveBeenCalled();
    expect(execAsync).not.toHaveBeenCalled();
  });
});
