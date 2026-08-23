/**
 * Stable-ID ordering. Every ID-keyed traversal that produces output sorts
 * with this comparator: kind lexicographic, then numeric suffix — so
 * "cell#2" precedes "cell#10" (plain string sort would not).
 */

export function compareIds(a: string, b: string): number {
  const ha = a.indexOf("#");
  const hb = b.indexOf("#");
  if (ha < 0 || hb < 0) return a < b ? -1 : a > b ? 1 : 0;
  const ka = a.slice(0, ha);
  const kb = b.slice(0, hb);
  if (ka !== kb) return ka < kb ? -1 : 1;
  const na = Number(a.slice(ha + 1));
  const nb = Number(b.slice(hb + 1));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

export const sortedIds = <T extends string>(ids: Iterable<T>): T[] =>
  [...ids].sort(compareIds);
