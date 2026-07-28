import { clampProgress, normalizeEpubProgress, pageFromProgress } from '../locators';

describe('reading locators', () => {
  it('clamps invalid progress and maps endpoints to one-based pages', () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(2)).toBe(1);
    expect(pageFromProgress(0, 20)).toBe(1);
    expect(pageFromProgress(1, 20)).toBe(20);
    expect(pageFromProgress(0.5, 1)).toBe(1);
  });

  it('normalizes EPUB percentage values from either supported scale', () => {
    expect(normalizeEpubProgress(42)).toBe(0.42);
    expect(normalizeEpubProgress(0.42)).toBe(0.42);
  });
});
