import type { ReadingLocator } from '@/domain/models';

export interface ReaderHandle {
  previous(): void;
  next(): void;
  seek(progress: number): void;
}

export interface ReaderProps {
  uri: string;
  initialLocator: ReadingLocator | null;
  onLocation(locator: ReadingLocator, progress: number): void;
  onToggleControls(): void;
  onMetadata?(metadata: { title?: string | null; author?: string | null; coverUri?: string | null }): void;
}
