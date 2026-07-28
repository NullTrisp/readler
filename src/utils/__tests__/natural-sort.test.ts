import { formatFromName } from '@/domain/models';
import { naturalCompare } from '../natural-sort';

describe('library file helpers', () => {
  it('sorts comic pages numerically and case-insensitively', () => {
    expect(['Page 10.jpg', 'page 2.jpg', 'page 1.jpg'].sort(naturalCompare)).toEqual([
      'page 1.jpg', 'page 2.jpg', 'Page 10.jpg',
    ]);
  });

  it('accepts only v1 formats', () => {
    expect(formatFromName('book.EPUB')).toBe('epub');
    expect(formatFromName('comic.cbz')).toBe('cbz');
    expect(formatFromName('archive.cbr')).toBeNull();
  });
});
