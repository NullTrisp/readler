import { parseComicInfo } from '../comic-info';

describe('ComicInfo.xml metadata', () => {
  it('reads catalogue fields, lists, dates, and XML entities', () => {
    expect(parseComicInfo(`<ComicInfo>
      <Title>A &amp; B &#x1F4DA;</Title><Writer>Ana</Writer><Series>Serie</Series><Number>12</Number>
      <Publisher>Editorial</Publisher><Year>2024</Year><Month>2</Month><Day>3</Day>
      <LanguageISO>es</LanguageISO><Genre>Adventure, Drama</Genre><Tags>Drama; Classic</Tags>
      <PageCount>24</PageCount>
    </ComicInfo>`)).toEqual({
      title: 'A & B 📚',
      author: 'Ana',
      series: 'Serie',
      seriesNumber: '12',
      publisher: 'Editorial',
      publishedAt: '2024-02-03',
      language: 'es',
      subjects: ['Adventure', 'Drama', 'Classic'],
      pageCount: 24,
    });
  });

  it('falls back to series/number and counts Page records', () => {
    expect(parseComicInfo(`<ComicInfo><Series>Serie</Series><Number>12</Number>
      <Pages><Page Image="0" Type="FrontCover" /><Page Image="1" /></Pages>
    </ComicInfo>`)).toEqual({
      title: 'Serie #12',
      author: null,
      series: 'Serie',
      seriesNumber: '12',
      publisher: null,
      publishedAt: null,
      language: null,
      subjects: [],
      pageCount: 2,
    });
  });
});
