export function parseComicInfo(xml: string) {
  const field = (name: string) => decodeXml(
    xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))?.[1]?.trim() ?? '',
  );
  const series = field('Series');
  const number = field('Number');
  return {
    title: field('Title') || [series, number].filter(Boolean).join(' #') || null,
    author: field('Writer') || null,
  };
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
