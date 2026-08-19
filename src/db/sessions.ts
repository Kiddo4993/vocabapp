import { getDB } from './client';
import { getMeta, setMeta } from './meta';
import type { SessionRecord } from '@/types/domain';

const ACTIVE_SESSION_KEY = 'activeSessionId';

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  const db = await getDB();
  return db.get('sessions', id);
}

/** Persisted after every answer (§2) so killing the tab mid-session and
 * reopening restores exactly where it left off. */
export async function putSession(session: SessionRecord): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
  await setMeta(ACTIVE_SESSION_KEY, session.completedAt ? undefined : session.id);
}

/** O(1) resume lookup — avoids scanning `sessions` by startedAt to find an
 * in-flight one. */
export async function getActiveSession(): Promise<SessionRecord | undefined> {
  const id = await getMeta<string | undefined>(ACTIVE_SESSION_KEY);
  if (!id) return undefined;
  const session = await getSession(id);
  if (!session || session.completedAt) return undefined;
  return session;
}

export async function clearActiveSession(): Promise<void> {
  await setMeta(ACTIVE_SESSION_KEY, undefined);
}

/** Every session in the database. Full-export use only (§4 backup) —
 * never called from an interactive UI path. */
export async function getAllSessions(): Promise<SessionRecord[]> {
  const db = await getDB();
  return db.getAll('sessions');
}

/** Recent sessions touching a given set, newest-first scan capped at
 * `scanLimit` (sessions has no setId index, so this walks the startedAt
 * index — bounded, not a full table walk) filtered down to the ones that
 * mention this set, then capped at `limit` for stats' accuracy trend
 * (§4). */
export async function getRecentSessionsForSet(setId: string, limit = 30, scanLimit = 300): Promise<SessionRecord[]> {
  const db = await getDB();
  const tx = db.transaction('sessions', 'readonly');
  const index = tx.store.index('startedAt');
  let cursor = await index.openCursor(null, 'prev');
  const items: SessionRecord[] = [];
  let scanned = 0;
  while (cursor && items.length < limit && scanned < scanLimit) {
    if (cursor.value.setIds.includes(setId)) items.push(cursor.value);
    scanned++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return items;
}

/** Bounded page of recent sessions for a mode — used by stats (§4: accuracy
 * trend over the last 30 sessions). Reads newest-first off the `startedAt`
 * index, never getAll(). */
export async function getRecentSessions(mode?: string, limit = 30): Promise<SessionRecord[]> {
  const db = await getDB();
  const tx = db.transaction('sessions', 'readonly');
  const index = tx.store.index('startedAt');
  let cursor = await index.openCursor(null, 'prev');
  const items: SessionRecord[] = [];
  while (cursor && items.length < limit) {
    if (!mode || cursor.value.mode === mode) items.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return items;
}
