import type { BookMetadata, ReadingLocator } from '@/domain/models';

export interface ReaderHandle {
  previous(): boolean;
  next(): boolean;
  seek(progress: number): void;
}

export interface ReaderProps {
  uri: string;
  initialLocator: ReadingLocator | null;
  onLocation(locator: ReadingLocator, progress: number): void;
  onToggleControls(): void;
  onMetadata?(metadata: Partial<BookMetadata> & { coverUri?: string | null }): void;
}
