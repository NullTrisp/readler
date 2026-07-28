import { Directory, DownloadTask, File, Paths } from 'expo-file-system';

import type { DownloadRecord, LibraryItem } from '@/domain/models';
import { getDownload, saveDownload } from '@/data/repository';
import { getDriveAccessToken } from './drive';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const activeTasks = new Map<string, DownloadTask>();

function downloadsDirectory() {
  const directory = new Directory(Paths.document, 'downloads');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

const timestamp = () => new Date().toISOString();

export async function startDownload(item: LibraryItem, onProgress?: (value: number) => void) {
  if (item.sourceKind !== 'drive') throw new Error('Only Google Drive items need downloading.');
  if (item.size && item.size > Paths.availableDiskSpace) throw new Error('There is not enough free space.');
  const token = await getDriveAccessToken();
  const destination = new File(downloadsDirectory(), `${item.id}.${item.format}`);
  const task = File.createDownloadTask(
    `${DRIVE_API}/files/${item.providerKey}?alt=media`,
    destination,
    {
      headers: { Authorization: `Bearer ${token}` },
      onProgress: ({ bytesWritten, totalBytes }) => {
        onProgress?.(totalBytes > 0 ? bytesWritten / totalBytes : 0);
        void saveDownload({
          itemId: item.id,
          status: 'downloading',
          localUri: null,
          bytesWritten,
          totalBytes,
          resumeData: null,
          error: null,
          updatedAt: timestamp(),
        });
      },
    },
  );
  activeTasks.set(item.id, task);
  await saveDownload(emptyRecord(item.id, 'downloading'));
  try {
    const file = await task.downloadAsync();
    if (!file) return;
    await saveDownload({
      itemId: item.id,
      status: 'ready',
      localUri: file.uri,
      bytesWritten: file.size,
      totalBytes: file.size,
      resumeData: null,
      error: null,
      updatedAt: timestamp(),
    });
  } catch (error) {
    await saveDownload({ ...emptyRecord(item.id, 'error'), error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    activeTasks.delete(item.id);
    task.release();
  }
}

export async function pauseDownload(itemId: string) {
  const task = activeTasks.get(itemId);
  if (!task) return;
  await task.pauseAsync();
  await saveDownload({
    ...emptyRecord(itemId, 'paused'),
    resumeData: JSON.stringify(task.savable()),
  });
}

export async function resumeDownload(item: LibraryItem, onProgress?: (value: number) => void) {
  const record = await getDownload(item.id);
  if (!record?.resumeData) return startDownload(item, onProgress);
  const token = await getDriveAccessToken();
  const task = DownloadTask.fromSavable(JSON.parse(record.resumeData), {
    headers: { Authorization: `Bearer ${token}` },
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress?.(totalBytes > 0 ? bytesWritten / totalBytes : 0);
      void saveDownload({ ...record, status: 'downloading', bytesWritten, totalBytes, updatedAt: timestamp() });
    },
  });
  activeTasks.set(item.id, task);
  await saveDownload({ ...record, status: 'downloading', updatedAt: timestamp() });
  try {
    const file = await task.resumeAsync();
    if (!file) return;
    await saveDownload({ ...record, status: 'ready', localUri: file.uri, bytesWritten: file.size,
      totalBytes: file.size, resumeData: null, error: null, updatedAt: timestamp() });
  } catch (error) {
    await saveDownload({ ...record, status: 'error', error: error instanceof Error ? error.message : String(error), updatedAt: timestamp() });
    throw error;
  } finally {
    activeTasks.delete(item.id);
    task.release();
  }
}

export async function cancelDownload(itemId: string) {
  activeTasks.get(itemId)?.cancel();
  activeTasks.delete(itemId);
  await saveDownload(emptyRecord(itemId, 'none'));
}

export async function removeDownload(item: LibraryItem) {
  if (item.localUri) {
    const file = new File(item.localUri);
    if (file.exists) file.delete();
  }
  await saveDownload(emptyRecord(item.id, 'none'));
}

function emptyRecord(itemId: string, status: DownloadRecord['status']): DownloadRecord {
  return {
    itemId,
    status,
    localUri: null,
    bytesWritten: 0,
    totalBytes: 0,
    resumeData: null,
    error: null,
    updatedAt: timestamp(),
  };
}
