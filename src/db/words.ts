import { getDB } from './client';
import type { Word } from '@/types/domain';

const IMPORT_BATCH_SIZE = 500;

export async function getWord(id: string): Promise<Word | undefined> {
  const db = await getDB();
  return db.get('words', id);
}

export async function getWordsByIds(ids: string[]): Promise<Word[]> {
  const db = await getDB();
  const tx = db.transaction('words', 'readonly');
  const results = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return results.filter((w): w is Word => w !== undefined);
}

export interface WordsPage {
  items: Word[];
  /** Cursor to pass back in as `after` to fetch the next page; undefined
   * once the set is exhausted. Never materialises the full id list — this
   * is what src/features/browse pages 200 at a time off an IDB cursor
   * instead of feeding the virtualiser a giant array (§2). */
  nextAfter?: [string, string];
}

/** Pages words in a set, ordered by term, via the [setId+term] compound
 * index — an index range scan, not a table walk. */
export async function getWordsBySetPage(
  setId: string,
  opts: { after?: [string, string]; limit?: number } = {},
): Promise<WordsPage> {
  const limit = opts.limit ?? 200;
  const db = await getDB();
  const tx = db.transaction('words', 'readonly');
  const index = tx.store.index('setId+term');

  const range = opts.after
    ? IDBKeyRange.bound([setId, opts.after[1]], [setId, '￿'], true, false)
    : IDBKeyRange.bound([setId, ''], [setId, '￿']);

  let cursor = await index.openCursor(range);
  const items: Word[] = [];
  while (cursor && items.length < limit) {
    items.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;

  const nextAfter = items.length === limit && cursor ? [setId, items[items.length - 1].term] as [string, string] : undefined;
  return { items, nextAfter };
}

/** Index-only count — doesn't materialise records. Safe to call for a
 * browse-header "X words" label even at 25k scale. */
export async function countWordsInSet(setId: string): Promise<number> {
  const db = await getDB();
  return db.countFromIndex('words', 'setId', setId);
}

/** Writes words in transactions of up to 500 records (§2), returning how
 * many were actually written (callers doing delta-import should filter to
 * changed words before calling this so "0 records written" is meaningful). */
export async function putWordsBatch(words: Word[]): Promise<number> {
  const db = await getDB();
  let written = 0;
  for (let i = 0; i < words.length; i += IMPORT_BATCH_SIZE) {
    const batch = words.slice(i, i + IMPORT_BATCH_SIZE);
    const tx = db.transaction('words', 'readwrite');
    await Promise.all(batch.map((w) => tx.store.put(w)));
    await tx.done;
    written += batch.length;
  }
  return written;
}

/** Write mode's "I was right" override (§3): records the accepted
 * near-miss spelling as an alias so the same guess is accepted outright
 * next time, instead of needing the override again. Doesn't touch
 * contentHash — aliases aren't part of the hashed content (§2), so this
 * never shows up as a "changed" word for delta re-import. */
export async function addWordAlias(wordId: string, alias: string): Promise<void> {
  const db = await getDB();
  const word = await db.get('words', wordId);
  if (!word) return;
  const normalized = alias.trim();
  if (!normalized) return;
  const exists = word.aliases.some((a) => a.toLowerCase() === normalized.toLowerCase());
  if (exists) return;
  await db.put('words', { ...word, aliases: [...word.aliases, normalized] });
}

/** Looks up existing contentHash for a set of word ids in one bounded pass
 * — used by the delta-import comparison (§2) so re-importing an unchanged
 * file writes zero records. */
export async function getExistingHashes(ids: string[]): Promise<Map<string, string>> {
  const db = await getDB();
  const tx = db.transaction('words', 'readonly');
  const out = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const w = await tx.store.get(id);
      if (w) out.set(id, w.contentHash);
    }),
  );
  await tx.done;
  return out;
}
