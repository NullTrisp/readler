import { ReaderProvider as NativeReaderProvider } from '@epubjs-react-native/core';
import type { PropsWithChildren } from 'react';

export function ReaderProvider({ children }: PropsWithChildren) {
  return <NativeReaderProvider>{children}</NativeReaderProvider>;
}
