import { saveDownload } from '@/data/repository';
import type { DownloadRecord, LibraryItem } from '@/domain/models';
import { getDriveAccessToken } from './drive';
import { deleteBrowserFile, getBrowserFile, putBrowserFile } from './web-storage';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const activeTasks = new Map<string, BrowserDownload>();

interface BrowserDownload {
  controller: AbortController;
  action: 'running' | 'paused' | 'cancelled';
  done: Promise<void>;
}

const timestamp = () => new Date().toISOString();
const storageKey = (itemId: string) => `drive-download:${itemId}`;

export async function startDownload(item: LibraryItem, onProgress?: (value: number) => void) {
  return download(item, null, onProgress);
}

export async function resumeDownload(item: LibraryItem, onProgress?: (value: number) => void) {
  const partial = await getBrowserFile(storageKey(item.id));
  return download(item, partial ?? null, onProgress);
}

async function download(item: LibraryItem, partial: Blob | null, onProgress?: (value: number) => void) {
  if (item.sourceKind !== 'drive') throw new Error('Only Google Drive items need downloading.');
  const estimate = await navigator.storage?.estimate?.();
  if (item.size && estimate?.quota && estimate.usage != null && item.size > estimate.quota - estimate.usage) {
    throw new Error('There is not enough browser storage available.');
  }
  const token = await getDriveAccessToken();
  const controller = new AbortController();
  const task: BrowserDownload = { controller, action: 'running', done: Promise.resolve() };
  activeTasks.set(item.id, task);
  task.done = runDownload(item, partial, task, token, onProgress);
  return task.done;
}

async function runDownload(
  item: LibraryItem,
  partial: Blob | null,
  task: BrowserDownload,
  token: string,
  onProgress?: (value: number) => void,
) {
  let bytesWritten = partial?.size ?? 0;
  const chunks: BlobPart[] = partial ? [partial] : [];
  try {
    await saveDownload(record(item.id, 'downloading', bytesWritten, item.size ?? 0));
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (bytesWritten) headers.Range = `bytes=${bytesWritten}-`;
    const response = await fetch(`${DRIVE_API}/files/${item.providerKey}?alt=media`, {
      headers,
      signal: task.controller.signal,
    });
    if (!response.ok) throw new Error(`Google Drive download failed (${response.status}).`);
    if (bytesWritten && response.status !== 206) {
      bytesWritten = 0;
      chunks.length = 0;
    }
    const responseLength = Number(response.headers.get('content-length') ?? 0);
    const totalBytes = item.size ?? bytesWritten + responseLength;
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Streaming downloads are not supported by this browser.');
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytesWritten += value.byteLength;
      onProgress?.(totalBytes ? bytesWritten / totalBytes : 0);
      await saveDownload(record(item.id, 'downloading', bytesWritten, totalBytes));
    }
    const complete = new Blob(chunks, { type: item.mimeType ?? 'application/octet-stream' });
    await putBrowserFile(storageKey(item.id), complete);
    await saveDownload({
      ...record(item.id, 'ready', complete.size, complete.size),
      localUri: `idb://${storageKey(item.id)}`,
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') {
      if (task.action === 'paused') {
        const incomplete = new Blob(chunks, { type: item.mimeType ?? 'application/octet-stream' });
        await putBrowserFile(storageKey(item.id), incomplete);
        await saveDownload({ ...record(item.id, 'paused', incomplete.size, item.size ?? 0), resumeData: String(incomplete.size) });
      } else if (task.action === 'cancelled') {
        await deleteBrowserFile(storageKey(item.id));
        await saveDownload(record(item.id, 'none'));
      }
      return;
    }
    await saveDownload({ ...record(item.id, 'error'), error: caught instanceof Error ? caught.message : String(caught) });
    throw caught;
  } finally {
    activeTasks.delete(item.id);
  }
}

export async function pauseDownload(itemId: string) {
  const task = activeTasks.get(itemId);
  if (!task) return;
  task.action = 'paused';
  task.controller.abort();
  await task.done;
}

export async function cancelDownload(itemId: string) {
  const task = activeTasks.get(itemId);
  if (task) {
    task.action = 'cancelled';
    task.controller.abort();
    await task.done;
    return;
  }
  await deleteBrowserFile(storageKey(itemId));
  await saveDownload(record(itemId, 'none'));
}

export async function removeDownload(item: LibraryItem) {
  await deleteBrowserFile(storageKey(item.id));
  await saveDownload(record(item.id, 'none'));
}

function record(itemId: string, status: DownloadRecord['status'], bytesWritten = 0, totalBytes = 0): DownloadRecord {
  return { itemId, status, localUri: null, bytesWritten, totalBytes, resumeData: null, error: null, updatedAt: timestamp() };
}
