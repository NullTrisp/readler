import type { Bookmark, ReadingProgress } from '@/domain/models';

export function compareVersions(aTime: string, aDevice: string, bTime: string, bDevice: string) {
  return aTime === bTime ? aDevice.localeCompare(bDevice) : aTime.localeCompare(bTime);
}

export function mergeProgress(records: ReadingProgress[]) {
  const result = new Map<string, ReadingProgress>();
  for (const record of records) {
    const current = result.get(record.providerKey);
    if (!current || compareVersions(current.updatedAt, current.installationId, record.updatedAt, record.installationId) < 0)
      result.set(record.providerKey, record);
  }
  return [...result.values()];
}

export function mergeBookmarks(records: Bookmark[]) {
  const result = new Map<string, Bookmark>();
  for (const record of records) {
    const current = result.get(record.id);
    if (!current || compareVersions(current.updatedAt, current.installationId, record.updatedAt, record.installationId) < 0)
      result.set(record.id, record);
  }
  return [...result.values()];
}
