// Sync-ready-without-a-backend merge (§2): every record carries updatedAt
// and origin (a device id), merge policy is last-write-wins on updatedAt.
// Nothing calls this yet — it exists so a future sync feature (or the
// backup import-merge in §4/§10.9) doesn't force a rewrite of the record
// shape. Pure, key-agnostic: works the same for words, progress, or
// sessions since they all carry the same two fields.

export interface Mergeable {
  updatedAt: number;
  origin: string;
  /** Tombstone — the record was deleted on some device. Never hard-removed
   * so a last-write-wins merge can still see and propagate the deletion. */
  deleted?: boolean;
}

/** Merges two versions of the *same* record. Last-write-wins on
 * updatedAt; on an exact tie, falls back to comparing `origin` strings so
 * the result is deterministic and order-independent (mergeRecord(a, b)
 * === mergeRecord(b, a)) regardless of which side is "local". A tombstone
 * is just a record with `deleted: true` — it participates in the same
 * comparison as any other edit, so a delete with a newer updatedAt wins
 * over an older edit, and an edit newer than a delete "undeletes" it. */
export function mergeRecord<T extends Mergeable>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? a : b;
  }
  return a.origin >= b.origin ? a : b;
}

/** Merges two full collections keyed by id. A key present on only one
 * side passes through unchanged; a key on both sides is resolved via
 * mergeRecord. */
export function mergeCollections<T extends Mergeable>(
  local: Record<string, T>,
  remote: Record<string, T>,
): Record<string, T> {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: Record<string, T> = {};
  for (const key of keys) {
    const l = local[key];
    const r = remote[key];
    out[key] = l && r ? mergeRecord(l, r) : (l ?? r)!;
  }
  return out;
}
