import { readlerThemes } from '../readler-ui';

const pairs = [
  ['primary', 'onPrimary'],
  ['primaryPressed', 'onPrimary'],
  ['primaryContainer', 'onPrimaryContainer'],
  ['surface', 'onSurface'],
  ['surfaceVariant', 'onSurfaceVariant'],
  ['background', 'onSurfaceVariant'],
  ['danger', 'onDanger'],
  ['dangerPressed', 'onDanger'],
  ['disabledContainer', 'onDisabled'],
] as const;

describe.each(Object.entries(readlerThemes))('Readler %s theme', (_name, theme) => {
  it.each(pairs)('%s and %s meet WCAG AA contrast', (background, foreground) => {
    expect(contrast(theme[background], theme[foreground])).toBeGreaterThanOrEqual(4.5);
  });
});

function contrast(first: string, second: string) {
  const light = luminance(first);
  const dark = luminance(second);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
