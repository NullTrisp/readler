const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function naturalCompare(a: string, b: string) {
  return collator.compare(a, b);
}
