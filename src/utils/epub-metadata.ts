import { decodeXml } from './comic-info';

export interface ParsedEpubMetadata {
  title: string | null;
  author: string | null;
  series: string | null;
  seriesNumber: string | null;
  publisher: string | null;
  publishedAt: string | null;
  language: string | null;
  subjects: string[];
  pageCount: number | null;
}

export interface ParsedEpubPackage {
  metadata: ParsedEpubMetadata;
  coverHref: string | null;
}

interface XmlElement {
  attributes: Record<string, string>;
  text: string;
}

export function parseEpubContainer(xml: string) {
  const rootfile = firstStartTag(xml, 'rootfile');
  return safeArchivePath(rootfile?.attributes['full-path'] ?? '');
}

export function parseEpubPackage(xml: string): ParsedEpubPackage {
  const titles = elementTexts(xml, 'title');
  const creators = elements(xml, 'creator');
  const metadataElements = elements(xml, 'meta');
  const authorCreators = creators.filter((creator) => {
    const refinedRole = creator.attributes.id
      ? metadataElements.find((entry) => entry.attributes.refines === `#${creator.attributes.id}`
        && entry.attributes.property?.toLocaleLowerCase() === 'role')?.text
      : null;
    const role = creator.attributes['opf:role'] ?? creator.attributes.role ?? refinedRole;
    return !role || role.toLocaleLowerCase() === 'aut';
  });
  const manifestItems = startTags(xml, 'item');

  const legacySeries = metaByName(metadataElements, 'calibre:series');
  const collection = epubSeries(metadataElements);
  const series = collection?.name ?? legacySeries;
  const seriesNumber = collection?.position ?? metaByName(metadataElements, 'calibre:series_index');
  const coverHref = epubCoverHref(metadataElements, manifestItems);
  const subjects = unique(elementTexts(xml, 'subject'));
  const pageCount = positiveInteger(
    metaByProperty(metadataElements, 'schema:numberofpages')
      ?? metaByName(metadataElements, 'calibre:page_count')
      ?? '',
  );

  return {
    metadata: {
      title: titles[0] ?? null,
      author: unique((authorCreators.length ? authorCreators : creators).map((creator) => creator.text)).join(', ') || null,
      series: series || null,
      seriesNumber: seriesNumber || null,
      publisher: elementTexts(xml, 'publisher')[0] ?? null,
      publishedAt: elementTexts(xml, 'date')[0] ?? null,
      language: elementTexts(xml, 'language')[0] ?? null,
      subjects,
      pageCount,
    },
    coverHref,
  };
}

export function resolveEpubResource(packagePath: string, href: string) {
  const decodedHref = safeDecodeUri(href.split(/[?#]/, 1)[0]);
  const directory = packagePath.includes('/') ? packagePath.slice(0, packagePath.lastIndexOf('/') + 1) : '';
  return safeArchivePath(`${directory}${decodedHref}`);
}

function epubCoverHref(metadata: XmlElement[], manifest: XmlElement[]) {
  const modern = manifest.find((item) => tokenList(item.attributes.properties).includes('cover-image'));
  if (modern?.attributes.href) return modern.attributes.href;

  const legacyId = metadata.find((entry) => entry.attributes.name?.toLocaleLowerCase() === 'cover')
    ?.attributes.content;
  const legacy = legacyId ? manifest.find((item) => item.attributes.id === legacyId) : undefined;
  if (legacy?.attributes.href) return legacy.attributes.href;

  return manifest.find((item) => {
    const id = item.attributes.id?.toLocaleLowerCase() ?? '';
    const href = item.attributes.href?.toLocaleLowerCase() ?? '';
    return item.attributes['media-type']?.startsWith('image/') && (id.includes('cover') || /(^|[/_.-])cover([/_.-]|$)/.test(href));
  })?.attributes.href ?? null;
}

function epubSeries(metadata: XmlElement[]) {
  const candidates = metadata.filter((entry) => entry.attributes.property?.toLocaleLowerCase() === 'belongs-to-collection');
  for (const candidate of candidates) {
    const id = candidate.attributes.id;
    const refinements = id ? metadata.filter((entry) => entry.attributes.refines === `#${id}`) : [];
    const collectionType = refinements.find((entry) => entry.attributes.property?.toLocaleLowerCase() === 'collection-type')?.text;
    if (collectionType && collectionType.toLocaleLowerCase() !== 'series') continue;
    return {
      name: candidate.text,
      position: refinements.find((entry) => entry.attributes.property?.toLocaleLowerCase() === 'group-position')?.text ?? null,
    };
  }
  return null;
}

function metaByName(metadata: XmlElement[], name: string) {
  const entry = metadata.find((candidate) => candidate.attributes.name?.toLocaleLowerCase() === name);
  return entry?.attributes.content || entry?.text || null;
}

function metaByProperty(metadata: XmlElement[], property: string) {
  return metadata.find((candidate) => candidate.attributes.property?.toLocaleLowerCase() === property)?.text ?? null;
}

function elements(xml: string, localName: string): XmlElement[] {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b([^>]*?)(?:\\/\\s*>|>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${localName}\\s*>)`,
    'gi',
  );
  return Array.from(xml.matchAll(pattern), (match) => ({
    attributes: parseAttributes(match[1] ?? ''),
    text: decodeXml(match[2] ?? match[1]?.match(/\\bcontent\\s*=\\s*(["'])([\\s\\S]*?)\\1/i)?.[2] ?? ''),
  }));
}

function elementTexts(xml: string, localName: string) {
  return elements(xml, localName).map((element) => element.text).filter(Boolean);
}

function startTags(xml: string, localName: string) {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${localName}\\b([^>]*)>`, 'gi');
  return Array.from(xml.matchAll(pattern), (match) => ({ attributes: parseAttributes(match[1] ?? ''), text: '' }));
}

function firstStartTag(xml: string, localName: string) {
  return startTags(xml, localName)[0] ?? null;
}

function parseAttributes(value: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  for (const match of value.matchAll(pattern)) attributes[match[1].toLocaleLowerCase()] = decodeXml(match[3]);
  return attributes;
}

function safeArchivePath(value: string) {
  const decoded = safeDecodeUri(value).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!decoded || decoded.startsWith('/')) return null;
  const output: string[] = [];
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!output.length) return null;
      output.pop();
    } else {
      output.push(segment);
    }
  }
  return output.join('/') || null;
}

function safeDecodeUri(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function tokenList(value = '') {
  return value.toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Map(values.filter(Boolean).map((value) => [value.toLocaleLowerCase(), value])).values());
}

function positiveInteger(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
