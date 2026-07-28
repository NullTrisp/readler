import { Directory, File, Paths } from 'expo-file-system';
import { getUncompressedSize, isPasswordProtected, unzip } from 'react-native-zip-archive';

import type { BookMetadata, LibraryItem } from '@/domain/models';
import { parseComicInfo } from '@/utils/comic-info';
import { parseEpubContainer, parseEpubPackage, resolveEpubResource } from '@/utils/epub-metadata';
import { naturalCompare } from '@/utils/natural-sort';

export type ExtractedBookMetadata = Partial<BookMetadata> & { coverUri?: string | null };

const MAX_ARCHIVE_BYTES = 768 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_COVER_BYTES = 64 * 1024 * 1024;
const IMAGE_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

interface ExtractedFile {
  file: File;
  path: string;
}

/**
 * Extracts catalogue metadata from a local or already materialized book.
 * The optional URI lets web/native callers pass a temporary materialization
 * without changing the item's durable source URI.
 */
export async function extractBookMetadata(
  item: LibraryItem,
  uri: string | null = item.localUri,
): Promise<ExtractedBookMetadata> {
  if (!uri) return {};
  // Native cards render PDF page 1 directly once a local copy is available.
  if (item.format === 'pdf') return {};

  const workRoot = new Directory(Paths.cache, 'book-metadata', safeName(item.id));
  resetDirectory(workRoot);
  try {
    const archive = await materializeArchive(uri, item.format, workRoot);
    const compressedSize = item.size ?? archive.size;
    if (compressedSize > MAX_ARCHIVE_BYTES) throw new Error('The book is too large to index safely.');

    const sourcePath = nativePath(archive.uri);
    if (await isPasswordProtected(sourcePath)) throw new Error('Password-protected books cannot be indexed.');
    const uncompressedSize = await getUncompressedSize(sourcePath);
    if (uncompressedSize > MAX_UNCOMPRESSED_BYTES || uncompressedSize > Paths.availableDiskSpace * 0.8) {
      throw new Error('The book needs too much temporary storage to index safely.');
    }

    const extractedRoot = new Directory(workRoot, 'contents');
    extractedRoot.create({ intermediates: true });
    await unzip(sourcePath, nativePath(extractedRoot.uri));
    const files: ExtractedFile[] = [];
    collectFiles(extractedRoot, '', files);
    if (files.length > MAX_ARCHIVE_ENTRIES) throw new Error('The book contains too many archive entries.');

    const metadata = item.format === 'cbz'
      ? await extractCbzMetadata(item, files)
      : await extractEpubMetadata(item, files);
    return metadata;
  } finally {
    if (workRoot.exists) workRoot.delete();
  }
}

async function extractCbzMetadata(item: LibraryItem, files: ExtractedFile[]): Promise<ExtractedBookMetadata> {
  const images = files.filter((entry) => IMAGE_PATTERN.test(entry.path)).sort((a, b) => naturalCompare(a.path, b.path));
  const comicInfo = files.find((entry) => /(^|\/)ComicInfo\.xml$/i.test(entry.path));
  const metadata = comicInfo ? parseComicInfo(await safeText(comicInfo.file)) : emptyMetadata();
  const coverUri = images[0] ? await persistCover(item, images[0].file) : null;
  return {
    ...metadata,
    pageCount: metadata.pageCount ?? (images.length || null),
    coverUri,
  };
}

async function extractEpubMetadata(item: LibraryItem, files: ExtractedFile[]): Promise<ExtractedBookMetadata> {
  const container = findArchiveFile(files, 'META-INF/container.xml');
  if (!container) throw new Error('The EPUB has no META-INF/container.xml file.');
  const packagePath = parseEpubContainer(await safeText(container.file));
  if (!packagePath) throw new Error('The EPUB package path is invalid.');
  const packageFile = findArchiveFile(files, packagePath);
  if (!packageFile) throw new Error('The EPUB package document is missing.');

  const parsed = parseEpubPackage(await safeText(packageFile.file));
  const coverPath = parsed.coverHref ? resolveEpubResource(packagePath, parsed.coverHref) : null;
  const cover = (coverPath && findArchiveFile(files, coverPath))
    ?? files.filter((entry) => IMAGE_PATTERN.test(entry.path)).sort((a, b) => naturalCompare(a.path, b.path))[0]
    ?? null;
  const coverUri = cover ? await persistCover(item, cover.file) : null;
  return { ...parsed.metadata, coverUri };
}

async function materializeArchive(uri: string, extension: string, workRoot: Directory) {
  const source = new File(uri);
  if (uri.startsWith('file://')) return source;
  const destination = new File(workRoot, `source.${extension}`);
  await source.copy(destination, { overwrite: true });
  return destination;
}

function collectFiles(directory: Directory, path: string, output: ExtractedFile[]) {
  for (const entry of directory.list()) {
    if (output.length > MAX_ARCHIVE_ENTRIES) return;
    const relativePath = `${path}${entry.name}`;
    if (entry instanceof Directory) collectFiles(entry, `${relativePath}/`, output);
    else output.push({ file: entry, path: relativePath.replace(/\\/g, '/') });
  }
}

function findArchiveFile(files: ExtractedFile[], path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return files.find((entry) => entry.path === normalized)
    ?? files.find((entry) => entry.path.toLocaleLowerCase() === normalized.toLocaleLowerCase())
    ?? null;
}

async function safeText(file: File) {
  if (file.size > MAX_XML_BYTES) throw new Error('The embedded metadata is too large to index safely.');
  return file.text();
}

async function persistCover(item: LibraryItem, source: File) {
  if (source.size > MAX_COVER_BYTES) throw new Error('The embedded cover is too large to index safely.');
  const extension = normalizedImageExtension(source.extension);
  if (!extension) return null;

  const covers = new Directory(Paths.document, 'covers');
  if (!covers.exists) covers.create({ intermediates: true });
  const itemKey = stableHash(item.id);
  const fingerprint = stableHash(`${item.providerKey}|${item.size ?? ''}|${item.modifiedAt ?? ''}|${source.name}|${source.size}`);
  const destination = new File(covers, `${itemKey}-${fingerprint}.${extension}`);
  if (!destination.exists) await source.copy(destination, { overwrite: true });

  for (const entry of covers.list()) {
    if (entry instanceof Directory || entry.uri === destination.uri) continue;
    if (entry.name.startsWith(`${itemKey}-`)) entry.delete();
  }
  return destination.uri;
}

function emptyMetadata(): BookMetadata {
  return {
    title: null,
    author: null,
    series: null,
    seriesNumber: null,
    publisher: null,
    publishedAt: null,
    language: null,
    subjects: [],
    pageCount: null,
  };
}

function normalizedImageExtension(value: string) {
  const extension = value.replace(/^\./, '').toLocaleLowerCase();
  if (extension === 'jpeg') return 'jpg';
  return /^(?:avif|gif|jpg|png|svg|webp)$/.test(extension) ? extension : null;
}

function resetDirectory(directory: Directory) {
  if (directory.exists) directory.delete();
  directory.create({ intermediates: true });
}

function nativePath(uri: string) {
  const path = uri.replace(/^file:\/\//, '');
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function safeName(value: string) {
  return `${value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80)}-${stableHash(value)}`;
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
