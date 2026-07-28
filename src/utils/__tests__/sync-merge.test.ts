import type { Bookmark, ReadingProgress } from '@/domain/models';
import { mergeBookmarks, mergeProgress } from '../sync-merge';

const base: ReadingProgress = {
  itemId: 'local-a', providerKey: 'drive-file', locator: { kind: 'page', index: 1, total: 10 },
  percent: 0.1, status: 'reading', updatedAt: '2026-01-01T00:00:00.000Z', installationId: 'a',
};

describe('sync merge', () => {
  it('keeps the newest progress and deterministically breaks timestamp ties', () => {
    const winner = { ...base, percent: 0.8, installationId: 'z' };
    expect(mergeProgress([base, winner])).toEqual([winner]);
  });

  it('propagates bookmark tombstones', () => {
    const bookmark: Bookmark = { id: 'bookmark', itemId: 'a', providerKey: 'drive-file',
      locator: { kind: 'page', index: 2, total: 10 }, createdAt: base.updatedAt, updatedAt: base.updatedAt,
      deletedAt: null, installationId: 'a' };
    const deleted = { ...bookmark, updatedAt: '2026-01-02T00:00:00.000Z', deletedAt: '2026-01-02T00:00:00.000Z' };
    expect(mergeBookmarks([bookmark, deleted])).toEqual([deleted]);
  });
});
