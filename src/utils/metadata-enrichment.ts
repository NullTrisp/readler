import type { LibraryItem } from '@/domain/models';

export const CURRENT_COVER_EXTRACTION_VERSION = 1;

export async function runWithConcurrency<Value>(
  values: readonly Value[],
  limit: number,
  operation: (value: Value, index: number) => Promise<void>,
) {
  if (!values.length) return;
  const workerCount = Math.min(values.length, Math.max(1, Math.floor(limit) || 1));
  let nextIndex = 0;
  let firstError: unknown;
  let failed = false;

  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await operation(values[index], index);
      } catch (caught) {
        if (!failed) firstError = caught;
        failed = true;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw firstError;
}

export function needsMetadataEnrichment(item: LibraryItem) {
  return Boolean(item.localUri) && (
    !item.metadataExtracted || item.coverExtractionVersion < CURRENT_COVER_EXTRACTION_VERSION
  );
}
