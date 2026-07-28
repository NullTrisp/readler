import { parseComicInfo } from '../comic-info';

describe('ComicInfo.xml metadata', () => {
  it('reads title, writer, and XML entities', () => {
    expect(parseComicInfo('<ComicInfo><Title>A &amp; B</Title><Writer>Ana</Writer></ComicInfo>')).toEqual({
      title: 'A & B', author: 'Ana',
    });
  });

  it('falls back to series and number', () => {
    expect(parseComicInfo('<ComicInfo><Series>Serie</Series><Number>12</Number></ComicInfo>')).toEqual({
      title: 'Serie #12', author: null,
    });
  });
});
