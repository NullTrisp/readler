import { downloadIsReady } from '../models';

test('only a completed download with a local URI is ready to open', () => {
  expect(downloadIsReady({ status: 'ready', localUri: 'file:///book.epub' })).toBe(true);
  expect(downloadIsReady({ status: 'ready', localUri: null })).toBe(false);
  expect(downloadIsReady({ status: 'paused', localUri: 'file:///partial.epub' })).toBe(false);
});
