import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { ContentSourceRecord, LibraryItem, ScanItem } from '@/domain/models';
import { formatFromName } from '@/domain/models';
import { replaceSourceItems, saveSource } from '@/data/repository';

const IMPORT_SOURCE_ID = 'ios-imports';

function ensureDirectory(parent: Directory, name: string) {
  const directory = new Directory(parent, name);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

export async function linkAndroidFolder() {
  if (Platform.OS !== 'android') throw new Error('Android folder access is only available on Android.');
  const directory = await Directory.pickDirectoryAsync();
  const source: ContentSourceRecord = {
    id: randomUUID(),
    kind: 'android-folder',
    name: directory.name || 'Local folder',
    rootRef: directory.uri,
    accountId: null,
    createdAt: new Date().toISOString(),
    lastScanAt: null,
  };
  await saveSource(source);
  await scanLocalSource(source);
  return source;
}

export async function importLocalFiles() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/epub+zip', 'application/zip', 'application/x-cbz'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const imports = ensureDirectory(Paths.document, 'imports');
  const source: ContentSourceRecord = {
    id: IMPORT_SOURCE_ID,
    kind: 'ios-import',
    name: 'Readler imports',
    rootRef: imports.uri,
    accountId: null,
    createdAt: new Date().toISOString(),
    lastScanAt: null,
  };
  await saveSource(source);
  for (const asset of result.assets) {
    if (!formatFromName(asset.name)) continue;
    const destination = new File(imports, `${randomUUID()}-${asset.name}`);
    await new File(asset.uri).copy(destination);
  }
  await scanLocalSource(source);
  return source;
}

export async function scanLocalSource(source: ContentSourceRecord) {
  if (!source.rootRef) throw new Error('This source no longer has a folder permission.');
  const root = new Directory(source.rootRef);
  const items: ScanItem[] = [];
  walkDirectory(root, '', items);
  await replaceSourceItems(source, items);
  return items;
}

function walkDirectory(directory: Directory, path: string, output: ScanItem[]) {
  for (const entry of directory.list()) {
    if (entry instanceof Directory) {
      walkDirectory(entry, `${path}${entry.name}/`, output);
      continue;
    }
    const format = formatFromName(entry.name);
    if (!format) continue;
    output.push({
      providerKey: entry.uri,
      format,
      name: entry.name,
      relativePath: `${path}${entry.name}`,
      mimeType: entry.type || null,
      size: entry.size,
      modifiedAt: entry.lastModified ? new Date(entry.lastModified).toISOString() : null,
      localUri: entry.uri,
    });
  }
}

export async function materializeLocalItem(item: LibraryItem) {
  if (!item.localUri) throw new Error('The local file is no longer available.');
  if (item.localUri.startsWith('file://')) return item.localUri;
  const materialized = ensureDirectory(Paths.cache, 'materialized');
  const destination = new File(materialized, `${item.id}.${item.format}`);
  if (!destination.exists) await new File(item.localUri).copy(destination);
  return destination.uri;
}

export async function disconnectLocalSource(source: ContentSourceRecord) {
  if (source.kind !== 'ios-import' || !source.rootRef) return;
  const directory = new Directory(source.rootRef);
  if (directory.exists) directory.delete();
}
