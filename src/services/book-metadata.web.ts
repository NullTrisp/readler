import type { BookMetadata, LibraryItem } from '@/domain/models';
import type { PDFPageProxy } from 'pdfjs-dist';
import { parseComicInfo } from '@/utils/comic-info';
import { parseEpubContainer, parseEpubPackage, resolveEpubResource } from '@/utils/epub-metadata';
import { naturalCompare } from '@/utils/natural-sort';

export type ExtractedBookMetadata = Partial<BookMetadata> & { coverUri?: string | null };

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_PDF_BYTES = 512 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_COVER_BYTES = 64 * 1024 * 1024;
const COVER_MAX_WIDTH = 320;
const COVER_MAX_HEIGHT = 480;
const IMAGE_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

interface ZipEntry {
  name: string;
  dir: boolean;
  unsafeOriginalName?: string;
  _data?: { uncompressedSize?: number };
  async(type: 'blob'): Promise<Blob>;
  async(type: 'string'): Promise<string>;
  async(type: 'uint8array'): Promise<Uint8Array>;
}

export async function extractBookMetadata(
  item: LibraryItem,
  uri: string | null = item.localUri,
): Promise<ExtractedBookMetadata> {
  if (!uri) return {};
  const maxBytes = item.format === 'pdf' ? MAX_PDF_BYTES : MAX_ARCHIVE_BYTES;
  if (item.size && item.size > maxBytes) throw new Error('The book is too large to index safely.');
  const bytes = await fetchBytes(uri, maxBytes);
  if (item.format === 'pdf') return extractPdfMetadata(bytes);

  const JSZip = (await import('jszip')).default;
  const archive = await JSZip.loadAsync(bytes);
  const entries = Object.values(archive.files) as ZipEntry[];
  assertSafeArchive(entries);
  return item.format === 'cbz'
    ? extractCbzMetadata(entries)
    : extractEpubMetadata(entries);
}

async function extractCbzMetadata(entries: ZipEntry[]): Promise<ExtractedBookMetadata> {
  const files = entries.filter((entry) => !entry.dir);
  const images = files.filter((entry) => IMAGE_PATTERN.test(entry.name)).sort((a, b) => naturalCompare(a.name, b.name));
  const comicInfo = files.find((entry) => /(^|\/)ComicInfo\.xml$/i.test(entry.name));
  const metadata = comicInfo ? parseComicInfo(await zipText(comicInfo)) : emptyMetadata();
  const coverUri = images[0] ? await zipCoverDataUri(images[0]) : null;
  return {
    ...metadata,
    pageCount: metadata.pageCount ?? (images.length || null),
    coverUri,
  };
}

async function extractEpubMetadata(entries: ZipEntry[]): Promise<ExtractedBookMetadata> {
  const container = findEntry(entries, 'META-INF/container.xml');
  if (!container) throw new Error('The EPUB has no META-INF/container.xml file.');
  const packagePath = parseEpubContainer(await zipText(container));
  if (!packagePath) throw new Error('The EPUB package path is invalid.');
  const packageEntry = findEntry(entries, packagePath);
  if (!packageEntry) throw new Error('The EPUB package document is missing.');

  const parsed = parseEpubPackage(await zipText(packageEntry));
  const coverPath = parsed.coverHref ? resolveEpubResource(packagePath, parsed.coverHref) : null;
  const cover = (coverPath && findEntry(entries, coverPath))
    ?? entries.filter((entry) => !entry.dir && IMAGE_PATTERN.test(entry.name)).sort((a, b) => naturalCompare(a.name, b.name))[0]
    ?? null;
  return {
    ...parsed.metadata,
    coverUri: cover ? await zipCoverDataUri(cover) : null,
  };
}

async function extractPdfMetadata(bytes: ArrayBuffer): Promise<ExtractedBookMetadata> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc ||= '/pdfjs/pdf.worker.min.mjs';
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    maxImageSize: 50_000_000,
  });
  try {
    const document = await loadingTask.promise;
    const [{ info, metadata }, page] = await Promise.all([document.getMetadata(), document.getPage(1)]);
    const dictionary = info as Record<string, unknown>;
    const subjects = unique([
      ...textList(metadata?.get('dc:subject')),
      ...splitSubjects(textValue(dictionary.Subject)),
      ...splitSubjects(textValue(dictionary.Keywords)),
    ]);
    const coverUri = await renderPdfCover(page);
    page.cleanup();
    return {
      title: textValue(metadata?.get('dc:title')) || textValue(dictionary.Title) || null,
      author: textValue(metadata?.get('dc:creator')) || textValue(dictionary.Author) || null,
      publisher: textValue(metadata?.get('dc:publisher')) || null,
      publishedAt: normalizePdfDate(textValue(metadata?.get('xmp:createdate')) || textValue(dictionary.CreationDate)),
      language: textValue(metadata?.get('dc:language')) || null,
      subjects,
      pageCount: document.numPages,
      coverUri,
    };
  } finally {
    await loadingTask.destroy();
  }
}

async function renderPdfCover(page: PDFPageProxy) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(COVER_MAX_WIDTH / base.width, COVER_MAX_HEIGHT / base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.78);
}

async function zipCoverDataUri(entry: ZipEntry) {
  assertEntrySize(entry, MAX_COVER_BYTES, 'The embedded cover is too large to index safely.');
  const blob = await entry.async('blob');
  if (blob.size > MAX_COVER_BYTES) throw new Error('The embedded cover is too large to index safely.');
  try {
    return await imageDataUri(blob);
  } catch {
    return null;
  }
}

async function imageDataUri(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = document.createElement('img');
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The embedded cover is not a supported image.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) return null;
    const scale = Math.min(COVER_MAX_WIDTH / image.naturalWidth, COVER_MAX_HEIGHT / image.naturalHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function zipText(entry: ZipEntry) {
  assertEntrySize(entry, MAX_XML_BYTES, 'The embedded metadata is too large to index safely.');
  const text = await entry.async('string');
  if (text.length > MAX_XML_BYTES) throw new Error('The embedded metadata is too large to index safely.');
  return text;
}

function assertSafeArchive(entries: ZipEntry[]) {
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('The book contains too many archive entries.');
  let knownUncompressedBytes = 0;
  for (const entry of entries) {
    const originalName = entry.unsafeOriginalName ?? entry.name;
    if (unsafeArchivePath(originalName)) throw new Error('The book contains an unsafe archive path.');
    const size = entry._data?.uncompressedSize;
    if (typeof size === 'number' && Number.isFinite(size)) knownUncompressedBytes += size;
    if (knownUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('The book expands beyond the safe indexing limit.');
    }
  }
}

function assertEntrySize(entry: ZipEntry, maximum: number, message: string) {
  const size = entry._data?.uncompressedSize;
  if (typeof size === 'number' && size > maximum) throw new Error(message);
}

function findEntry(entries: ZipEntry[], path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return entries.find((entry) => !entry.dir && entry.name === normalized)
    ?? entries.find((entry) => !entry.dir && entry.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())
    ?? null;
}

async function fetchBytes(uri: string, maximum: number) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`The book could not be read (${response.status}).`);
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maximum) throw new Error('The book is too large to index safely.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maximum) throw new Error('The book is too large to index safely.');
  return bytes;
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

function unsafeArchivePath(value: string) {
  return value.startsWith('/') || value.startsWith('\\') || value.split(/[\\/]/).some((segment) => segment === '..');
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return textValue(record['x-default'] ?? record.value ?? Object.values(record)[0]);
  }
  return '';
}

function textList(value: unknown) {
  if (Array.isArray(value)) return value.flatMap((entry) => splitSubjects(textValue(entry)));
  return splitSubjects(textValue(value));
}

function splitSubjects(value: string) {
  return value.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Map(values.filter(Boolean).map((value) => [value.toLocaleLowerCase(), value])).values());
}

function normalizePdfDate(value: string) {
  if (!value) return null;
  const match = value.match(/^(?:D:)?(\d{4})(\d{2})?(\d{2})?/);
  if (!match) return value;
  return [match[1], match[2], match[3]].filter(Boolean).join('-');
}
