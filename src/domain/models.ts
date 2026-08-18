export type ContentFormat = 'cbz' | 'epub' | 'pdf';
export type SourceKind = 'drive' | 'android-folder' | 'ios-import' | 'web-import';
export type LibraryMode = 'local' | 'drive';
export type ReadingStatus = 'unread' | 'reading' | 'finished';
export type DownloadStatus = 'none' | 'queued' | 'downloading' | 'paused' | 'ready' | 'error';

export interface BookMetadata {
  title: string | null;
  author: string | null;
  series: string | null;
  seriesNumber: string | null;
  publisher: string | null;
  publishedAt: string | null;
  language: string | null;
  subjects: string[];
  pageCount: number | null;
}

export interface ContentSourceRecord {
  id: string;
  kind: SourceKind;
  name: string;
  rootRef: string | null;
  accountId: string | null;
  createdAt: string;
  lastScanAt: string | null;
}

export interface LibraryItem extends BookMetadata {
  id: string;
  sourceId: string;
  sourceKind: SourceKind;
  providerKey: string;
  format: ContentFormat;
  name: string;
  title: string;
  relativePath: string;
  mimeType: string | null;
  size: number | null;
  modifiedAt: string | null;
  coverUri: string | null;
  metadataExtracted: boolean;
  coverExtractionVersion: number;
  localUri: string | null;
  available: boolean;
  downloadStatus: DownloadStatus;
  downloadProgress: number;
  status: ReadingStatus;
  progress: number;
  updatedAt: string;
}

export type ReadingLocator =
  | { kind: 'page'; index: number; total: number | null }
  | { kind: 'epubCfi'; cfi: string; percent: number };

export interface ReadingProgress {
  itemId: string;
  providerKey: string;
  locator: ReadingLocator;
  percent: number;
  status: ReadingStatus;
  updatedAt: string;
  installationId: string;
}

export interface Bookmark {
  id: string;
  itemId: string;
  providerKey: string;
  locator: ReadingLocator;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  installationId: string;
}

export interface DownloadRecord {
  itemId: string;
  status: DownloadStatus;
  localUri: string | null;
  bytesWritten: number;
  totalBytes: number;
  resumeData: string | null;
  error: string | null;
  updatedAt: string;
}

export function downloadIsReady(record: Pick<DownloadRecord, 'status' | 'localUri'> | null | undefined) {
  return record?.status === 'ready' && Boolean(record.localUri);
}

export interface ScanItem extends Partial<BookMetadata> {
  providerKey: string;
  format: ContentFormat;
  name: string;
  relativePath: string;
  mimeType?: string | null;
  size?: number | null;
  modifiedAt?: string | null;
  coverUri?: string | null;
  localUri?: string | null;
  metadataExtracted?: boolean;
  coverExtractionVersion?: number;
}

export interface ScanResult {
  source: ContentSourceRecord;
  items: ScanItem[];
}

export interface ContentSource {
  connect(): Promise<ContentSourceRecord>;
  scan(source: ContentSourceRecord): Promise<ScanResult>;
  materialize(item: LibraryItem): Promise<string>;
  disconnect(source: ContentSourceRecord): Promise<void>;
}

export interface SyncEnvelopeV1 {
  schemaVersion: 1;
  accountId: string;
  installationId: string;
  generatedAt: string;
  progress: ReadingProgress[];
  bookmarks: Bookmark[];
}

export interface LibraryFilter {
  query?: string;
  format?: ContentFormat | 'all';
  sourceKind?: SourceKind | 'all';
  status?: ReadingStatus | 'all';
  folder?: string | 'all';
  author?: string | 'all';
  series?: string | 'all';
  language?: string | 'all';
  subject?: string | 'all';
}

export function formatFromName(name: string): ContentFormat | null {
  const extension = name.toLowerCase().split('.').pop();
  return extension === 'cbz' || extension === 'epub' || extension === 'pdf' ? extension : null;
}

export function sourceMatchesLibraryMode(kind: SourceKind, mode: LibraryMode | null) {
  return mode !== null && (kind === 'drive') === (mode === 'drive');
}

export function resolveLibraryMode(stored: string | null, sources: readonly Pick<ContentSourceRecord, 'kind'>[]) {
  if (stored === 'local' || stored === 'drive') return stored;
  const hasDrive = sources.some((source) => source.kind === 'drive');
  const hasLocal = sources.some((source) => source.kind !== 'drive');
  return hasDrive === hasLocal ? null : hasDrive ? 'drive' : 'local';
}
