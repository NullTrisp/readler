import type { ScanItem } from '@/domain/models';
import { formatFromName } from '@/domain/models';

export const DIRECTORY_ROOT_PREFIX = 'readler-directory:';
const LINKED_FILE_PREFIX = 'readler-file:';

interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

export interface DirectoryHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<DirectoryHandleLike | FileHandleLike>;
  getDirectoryHandle(name: string): Promise<DirectoryHandleLike>;
  getFileHandle(name: string): Promise<FileHandleLike>;
}

export async function scanBrowserDirectory(root: DirectoryHandleLike, sourceId: string) {
  const items: ScanItem[] = [];
  await walkDirectory(root, '', sourceId, items);
  return items;
}

export async function getLinkedBrowserFile(root: DirectoryHandleLike, uri: string) {
  const { relativePath } = parseLinkedFileUri(uri);
  const segments = relativePath.split('/');
  const fileName = segments.pop();
  if (!fileName) throw new Error('The linked file path is invalid.');

  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
  return (await directory.getFileHandle(fileName)).getFile();
}

export function directoryRootRef(sourceId: string) {
  return `${DIRECTORY_ROOT_PREFIX}${sourceId}`;
}

export function linkedFileUri(sourceId: string, relativePath: string) {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${LINKED_FILE_PREFIX}${encodeURIComponent(sourceId)}/${encodedPath}`;
}

export function parseLinkedFileUri(uri: string) {
  if (!uri.startsWith(LINKED_FILE_PREFIX)) throw new Error('The linked file reference is invalid.');
  const value = uri.slice(LINKED_FILE_PREFIX.length);
  const separator = value.indexOf('/');
  if (separator < 1) throw new Error('The linked file reference is invalid.');
  return {
    sourceId: decodeURIComponent(value.slice(0, separator)),
    relativePath: value.slice(separator + 1).split('/').map(decodeURIComponent).join('/'),
  };
}

export function isLinkedDirectory(rootRef: string | null) {
  return Boolean(rootRef?.startsWith(DIRECTORY_ROOT_PREFIX));
}

async function walkDirectory(directory: DirectoryHandleLike, path: string, sourceId: string, output: ScanItem[]) {
  const pendingFiles: Promise<void>[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind === 'directory') {
      await walkDirectory(entry, `${path}${entry.name}/`, sourceId, output);
      continue;
    }
    const format = formatFromName(entry.name);
    if (!format) continue;
    pendingFiles.push(entry.getFile().then((file) => {
      const relativePath = `${path}${entry.name}`;
      const uri = linkedFileUri(sourceId, relativePath);
      output.push({
        providerKey: uri,
        format,
        name: entry.name,
        relativePath,
        mimeType: file.type || null,
        size: file.size,
        modifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
        localUri: uri,
      });
    }));
  }
  await Promise.all(pendingFiles);
}
