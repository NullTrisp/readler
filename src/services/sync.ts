import {
  deleteDriveReadingState,
  getInstallationId,
  getSetting,
  listDriveBookmarks,
  listDriveProgress,
  setSetting,
  upsertRemoteBookmark,
  upsertRemoteProgress,
} from '@/data/repository';
import type { ContentSourceRecord, SyncEnvelopeV1 } from '@/domain/models';
import {
  deleteAppDataFile,
  downloadDriveJson,
  listAppDataFiles,
  uploadDriveState,
} from './drive';

let activeSync: Promise<void> | null = null;

export function syncReadingState(source: ContentSourceRecord) {
  if (source.kind !== 'drive' || !source.accountId) return Promise.resolve();
  if (!activeSync) activeSync = runSync(source).finally(() => (activeSync = null));
  return activeSync;
}

async function runSync(source: ContentSourceRecord) {
  if (!source.accountId) return;
  const accountId = source.accountId;
  const installationId = await getInstallationId();
  const fileName = `state-${installationId}.json`;
  const remote = await listAppDataFiles();

  for (const file of remote.files) {
    try {
      const envelope = await downloadDriveJson(file.id);
      if (envelope.schemaVersion !== 1 || envelope.accountId !== accountId) continue;
      for (const progress of envelope.progress) await upsertRemoteProgress(progress);
      for (const bookmark of envelope.bookmarks) await upsertRemoteBookmark(bookmark);
    } catch {
      // A damaged snapshot must not block other devices or local reading.
    }
  }

  const envelope: SyncEnvelopeV1 = {
    schemaVersion: 1,
    accountId,
    installationId,
    generatedAt: new Date().toISOString(),
    progress: await listDriveProgress(),
    bookmarks: await listDriveBookmarks(true),
  };
  const existing = remote.files.find((file) => file.name === fileName);
  const storedId = await getSetting(`syncFile:${accountId}`);
  const uploaded = await uploadDriveState(fileName, envelope, existing?.id ?? storedId ?? undefined);
  await setSetting(`syncFile:${accountId}`, uploaded.id);
  await setSetting(`lastSync:${accountId}`, envelope.generatedAt);
}

export async function deleteAllSynchronizedData() {
  await activeSync?.catch(() => undefined);
  const remote = await listAppDataFiles();
  await Promise.all(remote.files.map((file) => deleteAppDataFile(file.id)));
  return remote.files.length;
}

export async function deleteLocalAndSynchronizedData() {
  const deletedSnapshots = await deleteAllSynchronizedData();
  await deleteDriveReadingState();
  return deletedSnapshots;
}
