import { deleteAppDataFile, listAppDataFiles, uploadDriveState } from '../drive';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'boundary' }));
jest.mock('@/data/repository', () => ({ replaceSourceItems: jest.fn(), saveSource: jest.fn() }));
jest.mock('../drive-auth', () => ({
  DRIVE_SCOPES: [],
  getDriveAccessToken: jest.fn(async () => 'token'),
  isGoogleConfigured: jest.fn(),
  restoreDriveSession: jest.fn(),
  signInToDrive: jest.fn(),
  signOutDrive: jest.fn(),
}));

test('recreates a sync snapshot when its cached Drive file ID is stale', async () => {
  const fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 404 })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'fresh-id' }) });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

  try {
    await expect(uploadDriveState('state-installation.json', {
      schemaVersion: 1,
      accountId: 'account',
      installationId: 'installation',
      generatedAt: '2026-08-04T19:24:50.438Z',
      progress: [],
      bookmarks: [],
    }, 'stale-id')).resolves.toEqual({ id: 'fresh-id' });

    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/stale-id?uploadType=multipart'), expect.objectContaining({ method: 'PATCH' }));
    expect(fetch).toHaveBeenNthCalledWith(2, expect.not.stringContaining('/stale-id'), expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"parents":["appDataFolder"]'),
    }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deletes a synchronized snapshot with shared-drive support enabled', async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

  try {
    await deleteAppDataFile('snapshot-id');
    expect(fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/snapshot-id?supportsAllDrives=true',
      expect.objectContaining({ method: 'DELETE' }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('lists Readler snapshots from the app data folder', async () => {
  const fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: 'one', name: 'state-one.json', modifiedTime: 'now' }], nextPageToken: 'next' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: 'two', name: 'state-two.json', modifiedTime: 'now' }] }) });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

  try {
    await expect(listAppDataFiles()).resolves.toEqual({ files: [
      { id: 'one', name: 'state-one.json', modifiedTime: 'now' },
      { id: 'two', name: 'state-two.json', modifiedTime: 'now' },
    ] });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('spaces=appDataFolder'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } }),
    );
    expect(fetch.mock.calls[0][0]).toContain('appDataFolder');
    expect(fetch.mock.calls[1][0]).toContain('pageToken=next');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
