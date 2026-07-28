import { useRouter } from 'expo-router';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { getDatabase } from '@/data/database';
import {
  getSetting,
  listLibrary,
  listSources,
  removeSource,
  setSetting,
  updateItemMetadata,
} from '@/data/repository';
import {
  resolveLibraryMode,
  sourceMatchesLibraryMode,
  type ContentSourceRecord,
  type LibraryFilter,
  type LibraryItem,
  type LibraryMode,
} from '@/domain/models';
import { connectDriveFolder, scanDriveSource, signOutDrive, type DriveFolder } from '@/services/drive';
import { pauseDownload } from '@/services/downloads';
import { disconnectLocalSource, importLocalFiles, linkAndroidFolder, materializeLocalItem, scanLocalSource } from '@/services/local-source';
import { extractBookMetadata } from '@/services/book-metadata';
import { syncReadingState } from '@/services/sync';
import {
  CURRENT_COVER_EXTRACTION_VERSION,
  needsMetadataEnrichment,
  runWithConcurrency,
} from '@/utils/metadata-enrichment';

const METADATA_CONCURRENCY = Platform.OS === 'web' ? 2 : 1;
const REFRESH_AFTER_ITEMS = 4;

interface AppContextValue {
  ready: boolean;
  loading: boolean;
  error: string | null;
  mode: LibraryMode | null;
  items: LibraryItem[];
  sources: ContentSourceRecord[];
  refresh(filter?: LibraryFilter): Promise<void>;
  refreshSources(): Promise<void>;
  importFiles(): Promise<boolean>;
  linkFolder(): Promise<boolean>;
  changeLibraryMode(mode: LibraryMode): Promise<void>;
  connectDrive(folder: DriveFolder, accountId: string): Promise<void>;
  disconnectSource(source: ContentSourceRecord): Promise<void>;
  sync(): Promise<void>;
  clearError(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<LibraryMode | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [sources, setSources] = useState<ContentSourceRecord[]>([]);
  const modeRef = useRef<LibraryMode | null>(null);
  const enrichingMetadata = useRef(false);
  const attemptedMetadata = useRef(new Set<string>());

  const refresh = useCallback(async (filter: LibraryFilter = {}) => {
    const activeMode = modeRef.current;
    setItems(activeMode ? (await listLibrary(filter)).filter((item) => sourceMatchesLibraryMode(item.sourceKind, activeMode)) : []);
  }, []);

  const refreshSources = useCallback(async () => {
    const activeMode = modeRef.current;
    setSources(activeMode ? (await listSources()).filter((source) => sourceMatchesLibraryMode(source.kind, activeMode)) : []);
  }, []);

  const loadModeState = useCallback(async (activeMode: LibraryMode | null) => {
    if (!activeMode) {
      setItems([]);
      setSources([]);
      return;
    }
    const [nextItems, nextSources] = await Promise.all([listLibrary(), listSources()]);
    setItems(nextItems.filter((item) => sourceMatchesLibraryMode(item.sourceKind, activeMode)));
    setSources(nextSources.filter((source) => sourceMatchesLibraryMode(source.kind, activeMode)));
  }, []);

  const activateMode = useCallback(async (nextMode: LibraryMode) => {
    await setSetting('libraryMode', nextMode);
    modeRef.current = nextMode;
    setItems([]);
    setSources([]);
    setMode(nextMode);
    await loadModeState(nextMode);
  }, [loadModeState]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      return await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await getDatabase();
      const [storedMode, allSources] = await Promise.all([getSetting('libraryMode'), listSources()]);
      const activeMode = resolveLibraryMode(storedMode, allSources);
      if (activeMode && activeMode !== storedMode) await setSetting('libraryMode', activeMode);
      modeRef.current = activeMode;
      setMode(activeMode);
      setSources(allSources.filter((source) => sourceMatchesLibraryMode(source.kind, activeMode)));
      setItems(activeMode
        ? (await listLibrary()).filter((item) => sourceMatchesLibraryMode(item.sourceKind, activeMode))
        : []);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready || enrichingMetadata.current) return;
    const pending = items.filter((item) => needsMetadataEnrichment(item) && !attemptedMetadata.current.has(
      `${item.id}|${item.size ?? ''}|${item.modifiedAt ?? ''}`,
    ));
    if (!pending.length) return;

    enrichingMetadata.current = true;
    void (async () => {
      let completed = 0;
      let refreshQueue = Promise.resolve();
      await runWithConcurrency(pending, METADATA_CONCURRENCY, async (item) => {
        const attemptKey = `${item.id}|${item.size ?? ''}|${item.modifiedAt ?? ''}`;
        try {
          const uri = Platform.OS === 'web' ? await materializeLocalItem(item) : item.localUri;
          const metadata = await extractBookMetadata(item, uri);
          await updateItemMetadata(item.id, {
            ...metadata,
            metadataExtracted: true,
            coverExtractionVersion: CURRENT_COVER_EXTRACTION_VERSION,
          }, {
            providerKey: item.providerKey,
            size: item.size,
            modifiedAt: item.modifiedAt,
          });
        } catch {
          // Metadata is optional. Avoid a retry loop for one damaged or temporarily unavailable
          // file, but allow another attempt after restart or when its source fingerprint changes.
          attemptedMetadata.current.add(attemptKey);
        }
        completed += 1;
        if (completed % REFRESH_AFTER_ITEMS === 0) {
          refreshQueue = refreshQueue.then(() => refresh()).catch(() => undefined);
          await refreshQueue;
        }
      });
      await refreshQueue;
      await refresh();
    })().finally(() => { enrichingMetadata.current = false; });
  }, [items, ready, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const drive = sources.find((source) => source.kind === 'drive');
      if (!drive) { void refresh(); return; }
      const isStale = !drive.lastScanAt || Date.now() - Date.parse(drive.lastScanAt) > 15 * 60 * 1000;
      void (async () => {
        if (isStale) await scanDriveSource(drive);
        await syncReadingState(drive);
        await Promise.all([refresh(), refreshSources()]);
      })().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refresh, refreshSources, sources]);

  const changeLibraryMode = useCallback(
    (nextMode: LibraryMode) => run(async () => {
      if (modeRef.current === nextMode) return;
      if (modeRef.current === 'drive' && nextMode === 'local') {
        await Promise.all(items.filter((item) => item.downloadStatus === 'downloading').map((item) => pauseDownload(item.id)));
      }
      await activateMode(nextMode);
      router.replace('/(tabs)');
    }),
    [activateMode, items, router, run],
  );

  const importFiles = useCallback(
    () => run(async () => {
      if (modeRef.current === 'drive') return false;
      const source = await importLocalFiles();
      if (!source) return false;
      await setSetting('onboardingComplete', 'true');
      await activateMode('local');
      return true;
    }),
    [activateMode, run],
  );

  const linkFolder = useCallback(
    () => run(async () => {
      if (modeRef.current === 'drive') return false;
      const source = await linkAndroidFolder();
      if (!source) return false;
      await setSetting('onboardingComplete', 'true');
      await activateMode('local');
      return true;
    }),
    [activateMode, run],
  );

  const connectDrive = useCallback(
    (folder: DriveFolder, accountId: string) => run(async () => {
      if (modeRef.current === 'local') return;
      const existing = (await listSources()).find((source) => source.kind === 'drive');
      if (existing) await removeSource(existing.id);
      const source = await connectDriveFolder(folder, accountId);
      await setSetting('onboardingComplete', 'true');
      await syncReadingState(source);
      await activateMode('drive');
      router.replace('/');
    }),
    [activateMode, router, run],
  );

  const disconnectSource = useCallback(
    (source: ContentSourceRecord) => run(async () => {
      if (!sourceMatchesLibraryMode(source.kind, modeRef.current)) return;
      if (source.kind === 'drive') await signOutDrive(false);
      else await disconnectLocalSource(source);
      await removeSource(source.id);
      await loadModeState(modeRef.current);
    }),
    [loadModeState, run],
  );

  const sync = useCallback(
    () => run(async () => {
      for (const source of sources) {
        if (source.kind === 'drive') {
          await scanDriveSource(source);
          await syncReadingState(source);
        } else if (source.kind === 'android-folder') {
          await scanLocalSource(source);
        } else if (source.rootRef) {
          await scanLocalSource(source);
        }
      }
      await Promise.all([refresh(), refreshSources()]);
    }),
    [refresh, refreshSources, run, sources],
  );

  const value = useMemo<AppContextValue>(() => ({
    ready, loading, error, mode, items, sources, refresh, refreshSources, importFiles,
    linkFolder, changeLibraryMode, connectDrive, disconnectSource, sync, clearError: () => setError(null),
  }), [ready, loading, error, mode, items, sources, refresh, refreshSources, importFiles, linkFolder, changeLibraryMode, connectDrive, disconnectSource, sync]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}

export const canLinkFolder = Platform.OS === 'android' || Platform.OS === 'web';
