import { randomUUID } from 'expo-crypto';

import { replaceSourceItems, saveSource } from '@/data/repository';
import type { ContentSourceRecord, LibraryItem, ScanItem } from '@/domain/models';
import { formatFromName } from '@/domain/models';
import i18n from '@/i18n';
import {
  directoryRootRef,
  getLinkedBrowserFile,
  isLinkedDirectory,
  parseLinkedFileUri,
  scanBrowserDirectory,
  type DirectoryHandleLike,
} from './web-directory';
import { deleteBrowserFile, getBrowserFile, getBrowserValue, putBrowserFile, putBrowserValue } from './web-storage';

const IMPORT_SOURCE_ID = 'web-imports';
const DIRECTORY_HANDLE_PREFIX = 'directory-handle:';
const objectUrls = new Map<string, string>();

type PermissionAwareDirectoryHandle = DirectoryHandleLike & {
  queryPermission?(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'read' }): Promise<PermissionState>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?(options: { id: string; mode: 'read' }): Promise<PermissionAwareDirectoryHandle>;
};

interface BrowserFileMetadata {
  providerKey: string;
  name: string;
  relativePath: string;
  mimeType: string | null;
  size: number;
  modifiedAt: string | null;
}

export async function linkAndroidFolder() {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (picker) {
    let directory: PermissionAwareDirectoryHandle;
    try {
      directory = await picker.call(window, { id: 'readler-library', mode: 'read' });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return null;
      throw caught;
    }

    const sourceId = `web-folder-${randomUUID()}`;
    const source: ContentSourceRecord = {
      id: sourceId,
      kind: 'web-import',
      name: directory.name || 'Browser folder',
      rootRef: directoryRootRef(sourceId),
      accountId: null,
      createdAt: new Date().toISOString(),
      lastScanAt: null,
    };
    const items = await scanBrowserDirectory(directory, sourceId);
    await putBrowserValue(directoryHandleKey(sourceId), directory);
    await replaceSourceItems(source, items);
    return source;
  }

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
  const supportedFiles = files.filter((file) => formatFromName(file.name));
  await ensureBrowserStorage(supportedFiles);
  const existing = readIndex(sourceId);
  const additions: BrowserFileMetadata[] = [];
  try {
    for (const file of supportedFiles) {
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
  } catch (caught) {
    await Promise.all(additions.map((entry) => deleteBrowserFile(entry.providerKey)));
    throw caught;
  }
  const merged = [...existing, ...additions];
  localStorage.setItem(indexKey(sourceId), JSON.stringify(merged));
  await saveSource(source);
  await scanLocalSource(source);
  return source;
}

export async function scanLocalSource(source: ContentSourceRecord) {
  if (isLinkedDirectory(source.rootRef)) {
    const directory = await linkedDirectory(source.id);
    const items = await scanBrowserDirectory(directory, source.id);
    await replaceSourceItems(source, items);
    return items;
  }
  const items: ScanItem[] = readIndex(source.id).flatMap((entry) => {
    const format = formatFromName(entry.name);
    return format ? [{ ...entry, format, localUri: `idb://${entry.providerKey}` }] : [];
  });
  await replaceSourceItems(source, items);
  return items;
}

export async function materializeLocalItem(item: LibraryItem) {
  if (!item.localUri) throw new Error('This file has not been downloaded or is no longer available.');
  if (item.localUri.startsWith('readler-file:')) {
    const { sourceId } = parseLinkedFileUri(item.localUri);
    const directory = await linkedDirectory(sourceId);
    const file = await getLinkedBrowserFile(directory, item.localUri);
    const cached = objectUrls.get(item.localUri);
    if (cached) return cached;
    const url = URL.createObjectURL(file);
    objectUrls.set(item.localUri, url);
    return url;
  }
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
  if (isLinkedDirectory(source.rootRef)) {
    for (const [key, url] of objectUrls) {
      if (key.startsWith(`readler-file:${encodeURIComponent(source.id)}/`)) {
        URL.revokeObjectURL(url);
        objectUrls.delete(key);
      }
    }
    await deleteBrowserFile(directoryHandleKey(source.id));
    return;
  }
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

function directoryHandleKey(sourceId: string) {
  return `${DIRECTORY_HANDLE_PREFIX}${sourceId}`;
}

async function linkedDirectory(sourceId: string) {
  const directory = await getBrowserValue<PermissionAwareDirectoryHandle>(directoryHandleKey(sourceId));
  if (!directory) throw new Error(i18n.t('linkedFolderUnavailable'));
  const permission = await directory.queryPermission?.({ mode: 'read' });
  if (permission !== 'granted' && await directory.requestPermission?.({ mode: 'read' }) !== 'granted') {
    throw new Error(i18n.t('linkedFolderPermission'));
  }
  return directory;
}

async function ensureBrowserStorage(files: File[]) {
  const required = files.reduce((total, file) => total + file.size, 0);
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota && estimate.usage != null && required > estimate.quota - estimate.usage) {
    throw new Error(i18n.t('browserStorageInsufficient'));
  }
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
