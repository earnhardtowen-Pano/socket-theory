import type { Id } from "@car/schema";
import { idKind } from "@car/schema";

/**
 * Total order over stable IDs: kind lexicographic, then numeric counter.
 * Raw string compare would put "curve#10" before "curve#2"; every ID-keyed
 * traversal that produces output sorts through here (statute: stable-ID order).
 */
export function compareId(a: Id, b: Id): number {
  const ka = idKind(a);
  const kb = idKind(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  const na = Number(a.slice(a.indexOf("#") + 1));
  const nb = Number(b.slice(b.indexOf("#") + 1));
  return na - nb;
}

export function sortedIds(ids: Iterable<Id>): Id[] {
  return [...ids].sort(compareId);
}
