import { getProgress, initialProgress, putProgressBatch } from '@/db/progress';
import { clearImportOffset, getImportOffset, setImportOffset, upsertSet } from '@/db/meta';
import { getExistingHashes, putWordsBatch } from '@/db/words';
import { contentHash } from '@/lib/hash';
import { parseWordList, type ParsedWord } from '@/lib/parse';
import type { Word } from '@/types/domain';
import { invalidateSearchIndexCache } from './searchWorker';
import type { ImportStartPayload, WorkerResponse } from './protocol';

const BATCH_SIZE = 500;

function parsedWordToWord(parsed: ParsedWord, setId: string, now: number, origin: string): Word {
  const word: Word = {
    id: parsed.id,
    setId,
    term: parsed.term,
    pos: parsed.pos,
    definition: parsed.definition,
    examples: parsed.examples,
    synonyms: [],
    antonyms: [],
    senses: parsed.senses.map((s) => ({
      pos: s.pos,
      definition: s.definition,
      examples: s.examples,
      synonyms: [],
      antonyms: [],
    })),
    aliases: [],
    contentHash: '',
    updatedAt: now,
    origin,
  };
  word.contentHash = contentHash(word);
  return word;
}

/**
 * Streamed, batched, resumable, delta-only import (§2/§6). Parses the
 * whole text up front (cheap, pure — src/lib/parse.ts), then writes in
 * transactions of 500, comparing each candidate word's contentHash against
 * what's already stored so re-importing an unchanged file writes zero
 * records and changing one definition writes exactly one (§9). The last
 * committed offset is recorded in meta after every batch, keyed by
 * `jobId`, so a killed tab resumes rather than restarting or
 * double-writing.
 */
export async function* handleImport(
  requestId: string,
  payload: ImportStartPayload,
): AsyncGenerator<WorkerResponse> {
  const { jobId, setId, setName, text, origin } = payload;

  const { words: parsedWords, issues } = parseWordList(text);
  const total = parsedWords.length;

  await upsertSet({ id: setId, name: setName, updatedAt: Date.now(), origin });

  let written = 0;
  let skipped = 0;
  let offset = await getImportOffset(jobId);

  for (let i = offset; i < total; i += BATCH_SIZE) {
    const batch = parsedWords.slice(i, i + BATCH_SIZE);
    const now = Date.now();
    const candidates = batch.map((p) => parsedWordToWord(p, setId, now, origin));

    const existingHashes = await getExistingHashes(candidates.map((w) => w.id));
    const changed = candidates.filter((w) => existingHashes.get(w.id) !== w.contentHash);

    if (changed.length > 0) {
      await putWordsBatch(changed);

      const newProgress = [];
      for (const w of changed) {
        if (existingHashes.has(w.id)) continue; // pre-existing word, content changed — never touch progress
        const existingProgress = await getProgress(w.id);
        if (!existingProgress) newProgress.push(initialProgress(w.id, setId, now, origin));
      }
      if (newProgress.length > 0) await putProgressBatch(newProgress);

      written += changed.length;
    }
    skipped += batch.length - changed.length;

    offset = i + batch.length;
    await setImportOffset(jobId, offset);
    yield { id: requestId, type: 'import:progress', payload: { processed: offset, total } };
  }

  await clearImportOffset(jobId);

  // The contentHash set just changed (if anything was actually written) —
  // without this, a search made later in the same worker's lifetime would
  // keep serving the pre-import cached index and silently miss the new
  // words until the next full reload.
  if (written > 0) await invalidateSearchIndexCache();

  yield {
    id: requestId,
    type: 'import:done',
    payload: { written, skipped, reviewLines: issues.length },
  };
}
