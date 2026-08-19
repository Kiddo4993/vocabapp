import { getDB } from './client';
import type { SetInfo } from '@/types/domain';

const DEVICE_ID_KEY = 'deviceId';
const SETS_KEY = 'sets';
const SEED_LOADED_KEY = 'seedLoaded';
const SEARCH_INDEX_KEY = 'searchIndex';

/** Generic meta get/set — the `meta` store is a plain key/value bag (§2:
 * key, no indexes). Prefer the named helpers below at call sites; this is
 * the primitive they're built on. */
export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const record = await db.get('meta', key);
  return record?.value as T | undefined;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('meta', { key, value });
}

/** Every record carries `origin` (§2 sync-ready-without-a-backend) so a
 * future last-write-wins merge can tell which device wrote it. Generated
 * once on first run and cached in meta. */
export async function getDeviceId(): Promise<string> {
  const existing = await getMeta<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await setMeta(DEVICE_ID_KEY, id);
  return id;
}

/** Set metadata (id/name) isn't its own object store (§2 lists only
 * words/progress/sessions/meta) — it lives here as a single meta record,
 * kept in sync as sets are created by import. */
export async function getSets(): Promise<SetInfo[]> {
  return (await getMeta<SetInfo[]>(SETS_KEY)) ?? [];
}

export async function upsertSet(set: SetInfo): Promise<void> {
  const sets = await getSets();
  const idx = sets.findIndex((s) => s.id === set.id);
  if (idx === -1) {
    sets.push(set);
  } else {
    sets[idx] = set;
  }
  await setMeta(SETS_KEY, sets);
}

export async function isSeedLoaded(): Promise<boolean> {
  return (await getMeta<boolean>(SEED_LOADED_KEY)) ?? false;
}

export async function markSeedLoaded(): Promise<void> {
  await setMeta(SEED_LOADED_KEY, true);
}

/** Resumable import (§2): the last committed batch offset per import job,
 * keyed by an id the caller controls (e.g. a hash of the source text plus
 * setId). A killed tab resumes from here instead of restarting or
 * double-writing. */
export function importOffsetKey(jobId: string): string {
  return `importOffset:${jobId}`;
}

export async function getImportOffset(jobId: string): Promise<number> {
  return (await getMeta<number>(importOffsetKey(jobId))) ?? 0;
}

export async function setImportOffset(jobId: string, offset: number): Promise<void> {
  await setMeta(importOffsetKey(jobId), offset);
}

export async function clearImportOffset(jobId: string): Promise<void> {
  const db = await getDB();
  await db.delete('meta', importOffsetKey(jobId));
}

/** Persisted inverted search index (§2: "built once in the worker,
 * persisted in meta, rebuilt only when the contentHash set changes"). The
 * shape is owned by src/lib/searchIndex.ts; meta just stores/loads it. */
export interface PersistedSearchIndex {
  /** hash of the sorted set of every word's contentHash — cheap to compare
   * to decide whether a rebuild is needed. */
  contentHashSetHash: string;
  builtAt: number;
  serialized: unknown;
}

export async function getSearchIndexMeta(): Promise<PersistedSearchIndex | undefined> {
  return getMeta<PersistedSearchIndex>(SEARCH_INDEX_KEY);
}

export async function setSearchIndexMeta(value: PersistedSearchIndex): Promise<void> {
  await setMeta(SEARCH_INDEX_KEY, value);
}

/** Match mode's personal-best timer, stored per set (§3: "personal best
 * stored per set"). Milliseconds, so the UI can format to two decimals. */
function matchBestKey(setId: string): string {
  return `matchBest:${setId}`;
}

export async function getMatchBest(setId: string): Promise<number | undefined> {
  return getMeta<number>(matchBestKey(setId));
}

export async function setMatchBest(setId: string, ms: number): Promise<void> {
  await setMeta(matchBestKey(setId), ms);
}

/** Every meta record. Full-export use only (§4 backup) — never called
 * from an interactive UI path. */
export async function getAllMeta(): Promise<{ key: string; value: unknown }[]> {
  const db = await getDB();
  return db.getAll('meta');
}
