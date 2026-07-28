import { randomUUID } from 'expo-crypto';

import type { ContentSourceRecord, ScanItem, SyncEnvelopeV1 } from '@/domain/models';
import { formatFromName } from '@/domain/models';
import { replaceSourceItems, saveSource } from '@/data/repository';

import {
  DRIVE_SCOPES,
  getDriveAccessToken,
  isGoogleConfigured,
  restoreDriveSession,
  signInToDrive,
  signOutDrive,
  type DriveUser,
} from './drive-auth';

export { DRIVE_SCOPES, getDriveAccessToken, isGoogleConfigured, restoreDriveSession, signInToDrive, signOutDrive };
export type { DriveUser };

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export interface DriveFolder {
  id: string;
  name: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
}

async function driveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getDriveAccessToken();
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
  });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
  return (await response.json()) as T;
}

export async function listDriveFolders(parentId = 'root') {
  const files = await listChildren(parentId, true);
  if (parentId === 'root') files.push(...await listSharedFolders());
  return Array.from(new Map(files.map((file) => [file.id, file])).values()).map(({ id, name }) => ({ id, name }));
}

async function listSharedFolders() {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      q: "sharedWithMe=true and trashed=false and mimeType='application/vnd.google-apps.folder'",
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await driveFetch<{ files: DriveFile[]; nextPageToken?: string }>(`/files?${query}`);
    all.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return all;
}

async function listChildren(parentId: string, foldersOnly = false) {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  const mimeFilter = foldersOnly ? " and mimeType='application/vnd.google-apps.folder'" : '';
  do {
    const query = new URLSearchParams({
      q: `'${parentId.replace(/'/g, "\\'")}' in parents and trashed=false${mimeFilter}`,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await driveFetch<{ files: DriveFile[]; nextPageToken?: string }>(`/files?${query}`);
    all.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return all;
}

export async function connectDriveFolder(folder: DriveFolder, accountId: string) {
  const source: ContentSourceRecord = {
    id: randomUUID(),
    kind: 'drive',
    name: folder.name,
    rootRef: folder.id,
    accountId,
    createdAt: new Date().toISOString(),
    lastScanAt: null,
  };
  await saveSource(source);
  await scanDriveSource(source);
  return source;
}

export async function scanDriveSource(source: ContentSourceRecord) {
  if (!source.rootRef) throw new Error('No Google Drive folder is connected.');
  const items: ScanItem[] = [];
  await walkDrive(source.rootRef, '', items);
  await replaceSourceItems(source, items);
  return items;
}

async function walkDrive(folderId: string, path: string, items: ScanItem[]) {
  const children = await listChildren(folderId);
  for (const child of children) {
    if (child.mimeType === 'application/vnd.google-apps.folder') {
      await walkDrive(child.id, `${path}${child.name}/`, items);
      continue;
    }
    const format = formatFromName(child.name);
    if (!format) continue;
    items.push({
      providerKey: child.id,
      format,
      name: child.name,
      relativePath: `${path}${child.name}`,
      mimeType: child.mimeType,
      size: child.size ? Number(child.size) : null,
      modifiedAt: child.modifiedTime ?? null,
      coverUri: child.thumbnailLink ?? null,
    });
  }
}

export async function listAppDataFiles() {
  const query = new URLSearchParams({
    spaces: 'appDataFolder',
    q: "name contains 'state-' and trashed=false",
    fields: 'files(id,name,modifiedTime)',
    pageSize: '1000',
  });
  return driveFetch<{ files: { id: string; name: string; modifiedTime: string }[] }>(`/files?${query}`);
}

export async function downloadDriveJson(fileId: string) {
  const token = await getDriveAccessToken();
  const response = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Could not download sync state (${response.status}).`);
  return (await response.json()) as SyncEnvelopeV1;
}

export async function uploadDriveState(name: string, envelope: SyncEnvelopeV1, existingId?: string) {
  const token = await getDriveAccessToken();
  const boundary = `readler-${randomUUID()}`;
  const metadata = existingId ? { name } : { name, parents: ['appDataFolder'] };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(envelope)}\r\n--${boundary}--`;
  const endpoint = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const response = await fetch(endpoint, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) throw new Error(`Could not upload sync state (${response.status}).`);
  return (await response.json()) as { id: string };
}

export async function deleteAppDataFile(fileId: string) {
  const token = await getDriveAccessToken();
  const response = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) throw new Error(`Could not delete sync data (${response.status}).`);
}
