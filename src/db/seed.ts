import { contentHash } from '@/lib/hash';
import type { RawSeedWord, Word, WordSeedFile } from '@/types/domain';
import { getDeviceId, isSeedLoaded, markSeedLoaded, upsertSet } from './meta';
import { getProgress, initialProgress, putProgressBatch } from './progress';
import { putWordsBatch } from './words';

const SEED_URL = '/data/words.seed.json';

export function rawWordToWord(raw: RawSeedWord, setId: string, now: number, origin: string): Word {
  const word: Word = {
    id: raw.id,
    setId,
    term: raw.term,
    pos: raw.pos,
    definition: raw.definition,
    simple: raw.simple,
    examples: raw.examples ?? [],
    synonyms: raw.synonyms ?? [],
    antonyms: raw.antonyms ?? [],
    senses: raw.senses ?? [],
    aliases: raw.aliases ?? [],
    notes: raw.notes,
    contentHash: '',
    updatedAt: now,
    origin,
  };
  word.contentHash = contentHash(word);
  return word;
}

/** Loads data/words.seed.json on first run only. Seed data is *fetched*,
 * never bundled (§2 bundle budget) — it's a static asset under /data, not
 * an import. Idempotent: safe to call on every app boot, it's a no-op once
 * `seedLoaded` is set. Existing progress for a word id is never touched, so
 * re-running this after a schema change can't reset mastery. */
export async function loadSeedIfNeeded(fetchImpl: typeof fetch = fetch): Promise<{ loaded: boolean; wordCount: number }> {
  if (await isSeedLoaded()) {
    return { loaded: false, wordCount: 0 };
  }

  const res = await fetchImpl(SEED_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch seed data: ${res.status} ${res.statusText}`);
  }
  const file = (await res.json()) as WordSeedFile;

  const origin = await getDeviceId();
  const now = Date.now();

  const words: Word[] = [];
  for (const set of file.sets) {
    await upsertSet({ id: set.id, name: set.name, updatedAt: now, origin });
    for (const raw of set.words) {
      words.push(rawWordToWord(raw, set.id, now, origin));
    }
  }

  await putWordsBatch(words);

  // Only seed a progress record for words that don't already have one —
  // matters if loadSeedIfNeeded is ever re-run after a partial failure, and
  // is the same "progress is separate from content" invariant that makes
  // delta re-import safe (§2): touching a word's content must never reset
  // its existing mastery.
  const progressRecords = [];
  for (const w of words) {
    const existing = await getProgress(w.id);
    if (existing) continue;
    progressRecords.push(initialProgress(w.id, w.setId, now, origin));
  }
  await putProgressBatch(progressRecords);

  await markSeedLoaded();
  return { loaded: true, wordCount: words.length };
}
