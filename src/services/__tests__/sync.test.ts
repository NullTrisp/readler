import { deleteAppDataFile, listAppDataFiles } from '../drive';
import { deleteAllSynchronizedData, deleteLocalAndSynchronizedData } from '../sync';

const mockDeleteDriveReadingState = jest.fn();

jest.mock('@/data/repository', () => ({
  deleteDriveReadingState: (...args: unknown[]) => mockDeleteDriveReadingState(...args),
  getInstallationId: jest.fn(),
  getSetting: jest.fn(),
  listDriveBookmarks: jest.fn(),
  listDriveProgress: jest.fn(),
  setSetting: jest.fn(),
  upsertRemoteBookmark: jest.fn(),
  upsertRemoteProgress: jest.fn(),
}));
jest.mock('../drive', () => ({
  deleteAppDataFile: jest.fn(),
  downloadDriveJson: jest.fn(),
  listAppDataFiles: jest.fn(),
  uploadDriveState: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

test('deletes every synchronized snapshot and reports how many were removed', async () => {
  (listAppDataFiles as jest.Mock).mockResolvedValue({
    files: [{ id: 'one' }, { id: 'two' }],
  });

  await expect(deleteAllSynchronizedData()).resolves.toBe(2);
  expect(deleteAppDataFile).toHaveBeenCalledTimes(2);
  expect(deleteAppDataFile).toHaveBeenCalledWith('one');
  expect(deleteAppDataFile).toHaveBeenCalledWith('two');
});

test('deletes remote snapshots before clearing local Drive reading state', async () => {
  (listAppDataFiles as jest.Mock).mockResolvedValue({ files: [{ id: 'remote' }] });
  (deleteAppDataFile as jest.Mock).mockResolvedValue(undefined);
  mockDeleteDriveReadingState.mockResolvedValue(undefined);

  await expect(deleteLocalAndSynchronizedData()).resolves.toBe(1);

  expect(deleteAppDataFile).toHaveBeenCalledWith('remote');
  expect((deleteAppDataFile as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(mockDeleteDriveReadingState.mock.invocationCallOrder[0]);
});
