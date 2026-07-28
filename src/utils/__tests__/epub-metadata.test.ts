import { parseEpubContainer, parseEpubPackage, resolveEpubResource } from '../epub-metadata';

describe('EPUB package metadata', () => {
  it('finds the package document and rejects paths escaping the archive', () => {
    expect(parseEpubContainer(`<?xml version="1.0"?>
      <container><rootfiles><rootfile full-path="OPS/package.opf" /></rootfiles></container>`))
      .toBe('OPS/package.opf');
    expect(parseEpubContainer('<container><rootfile full-path="../outside.opf" /></container>')).toBeNull();
  });

  it('parses EPUB 3 metadata, collection refinements, and cover-image', () => {
    const parsed = parseEpubPackage(`<package xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata>
        <dc:title>Libro &amp; prueba</dc:title>
        <dc:creator id="author">Ada</dc:creator><dc:creator id="editor">Editor</dc:creator>
        <meta refines="#author" property="role">aut</meta><meta refines="#editor" property="role">edt</meta>
        <dc:publisher>Editorial</dc:publisher><dc:date>2025-04-02</dc:date><dc:language>es</dc:language>
        <dc:subject>Ficción</dc:subject><dc:subject>Historia</dc:subject>
        <meta property="belongs-to-collection" id="series">Crónicas</meta>
        <meta refines="#series" property="collection-type">series</meta>
        <meta refines="#series" property="group-position">2</meta>
        <meta property="schema:numberOfPages">321</meta>
      </metadata>
      <manifest><item id="cover" href="Images/cover%20art.jpg" media-type="image/jpeg" properties="cover-image" /></manifest>
    </package>`);

    expect(parsed).toEqual({
      metadata: {
        title: 'Libro & prueba', author: 'Ada', series: 'Crónicas', seriesNumber: '2',
        publisher: 'Editorial', publishedAt: '2025-04-02', language: 'es',
        subjects: ['Ficción', 'Historia'], pageCount: 321,
      },
      coverHref: 'Images/cover%20art.jpg',
    });
    expect(resolveEpubResource('OPS/package.opf', parsed.coverHref!)).toBe('OPS/Images/cover art.jpg');
  });

  it('supports EPUB 2 cover and Calibre series metadata', () => {
    const parsed = parseEpubPackage(`<package><metadata>
      <dc:title>Legacy</dc:title><dc:creator opf:role="aut">One</dc:creator>
      <dc:creator opf:role="edt">Editor</dc:creator>
      <meta name="cover" content="cover-item" />
      <meta name="calibre:series" content="Legacy Series" />
      <meta name="calibre:series_index" content="4.5" />
    </metadata><manifest>
      <item id="cover-item" href="cover.png" media-type="image/png" />
    </manifest></package>`);

    expect(parsed.metadata.author).toBe('One');
    expect(parsed.metadata.series).toBe('Legacy Series');
    expect(parsed.metadata.seriesNumber).toBe('4.5');
    expect(parsed.coverHref).toBe('cover.png');
  });
});
