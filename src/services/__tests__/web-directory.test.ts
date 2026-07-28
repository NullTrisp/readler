import {
  directoryRootRef,
  getLinkedBrowserFile,
  linkedFileUri,
  parseLinkedFileUri,
  scanBrowserDirectory,
  type DirectoryHandleLike,
} from '../web-directory';

interface MockFile {
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

function file(name: string, size: number) {
  const value: MockFile = { name, size, type: 'application/zip', lastModified: Date.UTC(2026, 6, 28) };
  return { kind: 'file' as const, name, getFile: async () => value as unknown as File };
}

function directory(name: string, entries: (DirectoryHandleLike | ReturnType<typeof file>)[]): DirectoryHandleLike {
  return {
    kind: 'directory',
    name,
    async *values() { yield* entries; },
    async getDirectoryHandle(childName) {
      const child = entries.find((entry) => entry.kind === 'directory' && entry.name === childName);
      if (!child || child.kind !== 'directory') throw new Error('Directory not found');
      return child;
    },
    async getFileHandle(childName) {
      const child = entries.find((entry) => entry.kind === 'file' && entry.name === childName);
      if (!child || child.kind !== 'file') throw new Error('File not found');
      return child;
    },
  };
}

describe('linked browser directories', () => {
  const comic = file('Issue #1.cbz', 42);
  const root = directory('comics', [directory('The Flash (2023)', [comic]), file('notes.txt', 5)]);

  it('indexes supported files recursively without copying their contents', async () => {
    await expect(scanBrowserDirectory(root, 'source-1')).resolves.toEqual([expect.objectContaining({
      name: 'Issue #1.cbz',
      relativePath: 'The Flash (2023)/Issue #1.cbz',
      size: 42,
      format: 'cbz',
      localUri: linkedFileUri('source-1', 'The Flash (2023)/Issue #1.cbz'),
    })]);
  });

  it('round-trips encoded paths and resolves the selected file on demand', async () => {
    const uri = linkedFileUri('source-1', 'The Flash (2023)/Issue #1.cbz');
    expect(parseLinkedFileUri(uri)).toEqual({ sourceId: 'source-1', relativePath: 'The Flash (2023)/Issue #1.cbz' });
    await expect(getLinkedBrowserFile(root, uri)).resolves.toBe(await comic.getFile());
    expect(directoryRootRef('source-1')).toBe('readler-directory:source-1');
  });
});
