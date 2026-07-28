export interface ParsedComicInfo {
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

export function parseComicInfo(xml: string): ParsedComicInfo {
  const field = (name: string) => elementText(xml, name);
  const series = field('Series');
  const seriesNumber = field('Number');
  const subjects = unique([
    ...splitList(field('Genre')),
    ...splitList(field('Tags')),
  ]);

  return {
    title: field('Title') || [series, seriesNumber].filter(Boolean).join(' #') || null,
    author: field('Writer') || null,
    series: series || null,
    seriesNumber: seriesNumber || null,
    publisher: field('Publisher') || null,
    publishedAt: comicDate(field('Year'), field('Month'), field('Day')),
    language: field('LanguageISO') || null,
    subjects,
    pageCount: positiveInteger(field('PageCount')) ?? countComicPages(xml),
  };
}

export function decodeXml(value: string) {
  return value
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => codePoint(value, 16))
    .replace(/&#([0-9]+);/g, (_, value: string) => codePoint(value, 10))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function elementText(xml: string, name: string) {
  const match = xml.match(new RegExp(
    `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`,
    'i',
  ));
  return decodeXml(match?.[1] ?? '');
}

function splitList(value: string) {
  return value.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values());
}

function positiveInteger(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function countComicPages(xml: string) {
  const count = xml.match(/<(?:[\w.-]+:)?Page\b/gi)?.length ?? 0;
  return count || null;
}

function comicDate(year: string, month: string, day: string) {
  if (!/^\d{4}$/.test(year)) return null;
  if (!month) return year;
  const monthNumber = positiveInteger(month);
  if (!monthNumber || monthNumber > 12) return year;
  const base = `${year}-${String(monthNumber).padStart(2, '0')}`;
  if (!day) return base;
  const dayNumber = positiveInteger(day);
  if (!dayNumber || dayNumber > 31) return base;
  return `${base}-${String(dayNumber).padStart(2, '0')}`;
}

function codePoint(value: string, radix: number) {
  const number = Number.parseInt(value, radix);
  try {
    return Number.isFinite(number) ? String.fromCodePoint(number) : '';
  } catch {
    return '';
  }
}
