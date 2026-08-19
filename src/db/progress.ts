import { getDB } from './client';
import type { ProgressRecord } from '@/types/domain';

/** Internal storage shape: the real `starred: boolean` field plus a 0/1
 * shadow the `starred` index actually keys on (IndexedDB rejects boolean
 * keys — see the comment on VocabDB['progress']['indexes']['starred'] in
 * schema.ts). Never leaves this module. */
type StoredProgressRecord = ProgressRecord & { starredFlag: 0 | 1 };

function toStored(record: ProgressRecord): StoredProgressRecord {
  return { ...record, starredFlag: record.starred ? 1 : 0 };
}

// idb's generated types describe the store's value as ProgressRecord; the
// extra starredFlag field rides along at runtime (structural typing allows
// passing the wider StoredProgressRecord anywhere a ProgressRecord is
// expected) and is simply ignored by every reader that only knows about
// ProgressRecord's declared fields.

export async function getProgress(wordId: string): Promise<ProgressRecord | undefined> {
  const db = await getDB();
  return db.get('progress', wordId);
}

export async function getProgressByIds(wordIds: string[]): Promise<Map<string, ProgressRecord>> {
  const db = await getDB();
  const tx = db.transaction('progress', 'readonly');
  const out = new Map<string, ProgressRecord>();
  await Promise.all(
    wordIds.map(async (id) => {
      const p = await tx.store.get(id);
      if (p) out.set(id, p);
    }),
  );
  await tx.done;
  return out;
}

export async function putProgress(record: ProgressRecord): Promise<void> {
  const db = await getDB();
  await db.put('progress', toStored(record));
}

export async function putProgressBatch(records: ProgressRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('progress', 'readwrite');
  await Promise.all(records.map((r) => tx.store.put(toStored(r))));
  await tx.done;
}

/** Count of words due in a set as of `now`, via the [setId+due] compound
 * index — an index range count, not a table walk. This is what backs the
 * home screen's "Due today" number (§3). */
export async function getDueCount(setId: string, now: number): Promise<number> {
  const db = await getDB();
  const range = IDBKeyRange.bound([setId, -Infinity], [setId, now]);
  return db.countFromIndex('progress', 'setId+due', range);
}

/** Pulls up to `limit` due word ids for a set, ordered by due date, via the
 * same compound index. Sessions pull at most 20 items (§2), so this is
 * always called with a small bound. */
export async function getDueWordIds(setId: string, now: number, limit = 20): Promise<string[]> {
  const db = await getDB();
  const tx = db.transaction('progress', 'readonly');
  const index = tx.store.index('setId+due');
  const range = IDBKeyRange.bound([setId, -Infinity], [setId, now]);
  let cursor = await index.openCursor(range);
  const ids: string[] = [];
  while (cursor && ids.length < limit) {
    ids.push(cursor.value.wordId);
    cursor = await cursor.continue();
  }
  await tx.done;
  return ids;
}

/** Bounded page of starred words (browse "starred" filter). */
export async function getStarredPage(limit = 200, afterWordId?: string): Promise<ProgressRecord[]> {
  const db = await getDB();
  const tx = db.transaction('progress', 'readonly');
  const index = tx.store.index('starred');
  let cursor = await index.openCursor(IDBKeyRange.only(1));
  const items: ProgressRecord[] = [];
  let skipping = Boolean(afterWordId);
  while (cursor && items.length < limit) {
    if (skipping) {
      if (cursor.value.wordId === afterWordId) skipping = false;
    } else {
      items.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return items;
}

/** Every progress record in the database. Full-export use only (§4
 * backup) — never called from an interactive UI path. */
export async function getAllProgress(): Promise<ProgressRecord[]> {
  const db = await getDB();
  return db.getAll('progress');
}

/** Every progress record for a set, via a full-range scan of the
 * [setId+due] compound index — an index range scan (bounded by the set's
 * size), not a table walk. Used by stats aggregation (§4) and confusion
 * pairs (§4), both of which run in the worker. */
export async function getAllProgressForSet(setId: string): Promise<ProgressRecord[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound([setId, -Infinity], [setId, Infinity]);
  return db.getAllFromIndex('progress', 'setId+due', range);
}

/** Creates a fresh box-1, same-session-due progress record for a newly
 * imported word. Doesn't touch an existing record for the same wordId —
 * callers must check existence first so re-import never resets mastery
 * (§2). */
export function initialProgress(wordId: string, setId: string, now: number, origin: string): ProgressRecord {
  return {
    wordId,
    setId,
    box: 1,
    due: now,
    tier: 'recognise',
    right: 0,
    wrong: 0,
    seen: 0,
    lastSeen: 0,
    avgMs: 0,
    starred: false,
    missedAgainst: {},
    updatedAt: now,
    origin,
  };
}
