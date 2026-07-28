import { randomUUID } from 'expo-crypto';

import { replaceSourceItems, saveSource } from '@/data/repository';
import type { ContentSourceRecord, LibraryItem, ScanItem } from '@/domain/models';
import { formatFromName } from '@/domain/models';
import { deleteBrowserFile, getBrowserFile, putBrowserFile } from './web-storage';

const IMPORT_SOURCE_ID = 'web-imports';
const objectUrls = new Map<string, string>();

interface BrowserFileMetadata {
  providerKey: string;
  name: string;
  relativePath: string;
  mimeType: string | null;
  size: number;
  modifiedAt: string | null;
}

export async function linkAndroidFolder() {
  const files = await pickFiles(true);
  if (!files.length) return null;
  return storeFiles(files, `web-folder-${randomUUID()}`, files[0].webkitRelativePath.split('/')[0] || 'Browser folder');
}

export async function importLocalFiles() {
  const files = await pickFiles(false);
  if (!files.length) return null;
  return storeFiles(files, IMPORT_SOURCE_ID, 'Readler browser imports');
}

async function storeFiles(files: File[], sourceId: string, name: string) {
  const source: ContentSourceRecord = {
    id: sourceId,
    kind: 'web-import',
    name,
    rootRef: sourceId,
    accountId: null,
    createdAt: new Date().toISOString(),
    lastScanAt: null,
  };
  const existing = readIndex(sourceId);
  const additions: BrowserFileMetadata[] = [];
  for (const file of files) {
    if (!formatFromName(file.name)) continue;
    const providerKey = `browser-file:${randomUUID()}`;
    await putBrowserFile(providerKey, file);
    additions.push({
      providerKey,
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
      mimeType: file.type || null,
      size: file.size,
      modifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    });
  }
  const merged = [...existing, ...additions];
  localStorage.setItem(indexKey(sourceId), JSON.stringify(merged));
  await saveSource(source);
  await scanLocalSource(source);
  return source;
}

export async function scanLocalSource(source: ContentSourceRecord) {
  const items: ScanItem[] = readIndex(source.id).flatMap((entry) => {
    const format = formatFromName(entry.name);
    return format ? [{ ...entry, format, localUri: `idb://${entry.providerKey}` }] : [];
  });
  await replaceSourceItems(source, items);
  return items;
}

export async function materializeLocalItem(item: LibraryItem) {
  if (!item.localUri) throw new Error('This file has not been downloaded or is no longer available.');
  if (!item.localUri.startsWith('idb://')) return item.localUri;
  const key = item.localUri.slice('idb://'.length);
  const cached = objectUrls.get(key);
  if (cached) return cached;
  const blob = await getBrowserFile(key);
  if (!blob) throw new Error('The browser no longer has this file. Import or download it again.');
  const url = URL.createObjectURL(blob);
  objectUrls.set(key, url);
  return url;
}

export async function disconnectLocalSource(source: ContentSourceRecord) {
  const entries = readIndex(source.id);
  await Promise.all(entries.map(async (entry) => {
    const url = objectUrls.get(entry.providerKey);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(entry.providerKey);
    await deleteBrowserFile(entry.providerKey);
  }));
  localStorage.removeItem(indexKey(source.id));
}

function readIndex(sourceId: string) {
  try {
    return JSON.parse(localStorage.getItem(indexKey(sourceId)) ?? '[]') as BrowserFileMetadata[];
  } catch {
    return [];
  }
}

function indexKey(sourceId: string) {
  return `readler:source:${sourceId}:files`;
}

function pickFiles(directory: boolean) {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.cbz,.epub,.pdf,application/pdf,application/epub+zip,application/zip';
    if (directory) input.setAttribute('webkitdirectory', '');
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}
