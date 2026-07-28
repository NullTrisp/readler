import type { LibraryItem } from '@/domain/models';

const item = {
  id: 'item-1',
  providerKey: 'provider-1',
  format: 'cbz',
  name: 'sample.cbz',
  size: 1024,
  modifiedAt: '2026-07-28T00:00:00.000Z',
  localUri: 'file:///library/sample.cbz',
} as LibraryItem;

describe('native book metadata extraction', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('keeps extracted CBZ files until the persistent cover copy finishes', async () => {
    const deletedDirectories: string[] = [];
    let finishCoverCopy!: () => void;
    let markCoverCopyStarted!: () => void;
    const coverCopyStarted = new Promise<void>((resolve) => { markCoverCopyStarted = resolve; });

    class MockDirectory {
      exists = false;
      readonly name: string;
      readonly uri: string;

      constructor(...parts: (string | MockDirectory)[]) {
        this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/').replace(/\/+/g, '/');
        this.name = this.uri.split('/').pop() ?? '';
      }

      create() {
        this.exists = true;
      }

      delete() {
        deletedDirectories.push(this.uri);
        this.exists = false;
      }

      list() {
        return this.name === 'contents' ? [new MockFile(this, '001-cover.png')] : [];
      }
    }

    class MockFile {
      readonly exists: boolean;
      readonly extension: string;
      readonly name: string;
      readonly size: number;
      readonly uri: string;

      constructor(...parts: (string | MockDirectory)[]) {
        this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/').replace(/([^:])\/+/g, '$1/');
        this.name = this.uri.split('/').pop() ?? '';
        this.extension = this.name.includes('.') ? `.${this.name.split('.').pop()}` : '';
        this.size = this.name === '001-cover.png' ? 512 : 1024;
        this.exists = this.uri === item.localUri;
      }

      copy() {
        if (this.name !== '001-cover.png') return Promise.resolve();
        markCoverCopyStarted();
        return new Promise<void>((resolve) => { finishCoverCopy = resolve; });
      }

      text() {
        return Promise.resolve('');
      }
    }

    jest.doMock('expo-file-system', () => ({
      Directory: MockDirectory,
      File: MockFile,
      Paths: {
        availableDiskSpace: 1024 * 1024 * 1024,
        cache: new MockDirectory('file:///cache'),
        document: new MockDirectory('file:///document'),
      },
    }));
    jest.doMock('react-native-zip-archive', () => ({
      getUncompressedSize: jest.fn(async () => 2048),
      isPasswordProtected: jest.fn(async () => false),
      unzip: jest.fn(async () => 'file:///cache/contents'),
    }));

    const { extractBookMetadata } = jest.requireActual<typeof import('@/services/book-metadata')>(
      '@/services/book-metadata',
    );
    const extraction = extractBookMetadata(item);
    await coverCopyStarted;

    expect(deletedDirectories).toEqual([]);

    finishCoverCopy();
    await expect(extraction).resolves.toMatchObject({
      coverUri: expect.stringContaining('/document/covers/'),
      pageCount: 1,
    });
    expect(deletedDirectories).toHaveLength(1);
    expect(deletedDirectories[0]).toContain('/cache/book-metadata/');
  });
});
