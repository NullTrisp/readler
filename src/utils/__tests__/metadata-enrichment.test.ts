import type { LibraryItem } from '@/domain/models';
import {
  CURRENT_COVER_EXTRACTION_VERSION,
  needsMetadataEnrichment,
  runWithConcurrency,
} from '@/utils/metadata-enrichment';

const item: LibraryItem = {
  id: 'item-1',
  sourceId: 'source-1',
  sourceKind: 'web-import',
  providerKey: 'browser-file:1',
  format: 'cbz',
  name: 'Issue 1.cbz',
  title: 'Issue 1',
  author: null,
  series: null,
  seriesNumber: null,
  publisher: null,
  publishedAt: null,
  language: null,
  subjects: [],
  pageCount: 24,
  metadataExtracted: true,
  coverExtractionVersion: CURRENT_COVER_EXTRACTION_VERSION,
  relativePath: 'Issue 1.cbz',
  mimeType: 'application/zip',
  size: 100,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  coverUri: 'data:image/jpeg;base64,cover',
  localUri: 'idb://browser-file:1',
  available: true,
  downloadStatus: 'ready',
  downloadProgress: 1,
  status: 'unread',
  progress: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('metadata enrichment state', () => {
  it('reindexes an old local row even when metadata was already extracted', () => {
    expect(needsMetadataEnrichment({ ...item, coverExtractionVersion: 0 })).toBe(true);
  });

  it('waits for a remote file to become local before extracting its exact cover', () => {
    expect(needsMetadataEnrichment({ ...item, localUri: null, coverExtractionVersion: 0 })).toBe(false);
  });

  it('skips a local row only when metadata and the current cover version are complete', () => {
    expect(needsMetadataEnrichment(item)).toBe(false);
    expect(needsMetadataEnrichment({ ...item, metadataExtracted: false })).toBe(true);
  });
});

describe('bounded metadata concurrency', () => {
  it('keeps several workers busy without exceeding the limit', async () => {
    let active = 0;
    let maximumActive = 0;
    const completed: number[] = [];

    await runWithConcurrency([0, 1, 2, 3, 4, 5, 6], 3, async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      completed.push(value);
      active -= 1;
    });

    expect(maximumActive).toBe(3);
    expect(completed.sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('falls back to one worker for an invalid limit', async () => {
    let active = 0;
    let maximumActive = 0;
    await runWithConcurrency([0, 1, 2], 0, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
    });
    expect(maximumActive).toBe(1);
  });

  it('drains the queue before propagating the first worker error', async () => {
    const attempted: number[] = [];
    const operation = runWithConcurrency([0, 1, 2, 3], 2, async (value) => {
      attempted.push(value);
      await Promise.resolve();
      if (value === 1) throw new Error('damaged book');
    });

    await expect(operation).rejects.toThrow('damaged book');
    expect(attempted.sort((left, right) => left - right)).toEqual([0, 1, 2, 3]);
  });
});
