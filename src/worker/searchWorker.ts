import { getSearchIndexMeta, setSearchIndexMeta } from '@/db/meta';
import { getAllWordsForIndexing } from '@/db/words';
import { hashContentHashSet } from '@/lib/hash';
import { buildSearchIndex, searchIndexQuery, searchIndexTermCount, type SearchIndex } from '@/lib/searchIndex';
import type { WorkerResponse } from './protocol';

// In-memory cache for the lifetime of the worker — avoids re-reading meta
// on every keystroke. Still backed by the persisted copy in `meta` (§2:
// "persisted in meta, rebuilt only when the contentHash set changes"), so
// a fresh worker instance (new tab, reload) picks up the cached build
// immediately instead of re-indexing from scratch when nothing changed.
let cached: SearchIndex | undefined;

async function ensureIndex(): Promise<SearchIndex> {
  // The in-memory cache check MUST come before any store read — this used
  // to read + re-hash every word on every single query, before ever
  // consulting `cached`, which completely defeated the cache and made
  // search latency scale with corpus size (measured ~2s/query at 25k
  // words instead of the <50ms budget, via scripts/bench.mjs).
  if (cached) return cached;

  const words = await getAllWordsForIndexing();
  const currentHash = hashContentHashSet(words.map((w) => w.contentHash));

  const persisted = await getSearchIndexMeta();
  if (persisted && persisted.contentHashSetHash === currentHash) {
    cached = persisted.serialized as SearchIndex;
    return cached;
  }

  const index = buildSearchIndex(words);
  cached = index;
  await setSearchIndexMeta({ contentHashSetHash: currentHash, builtAt: Date.now(), serialized: index });
  return index;
}

/** Forces a rebuild check (called after an import completes, since the
 * contentHash set just changed) — cheap no-op if nothing actually
 * changed, since ensureIndex re-hashes and compares either way. */
export async function invalidateSearchIndexCache(): Promise<void> {
  cached = undefined;
}

export async function handleSearchBuild(requestId: string): Promise<WorkerResponse> {
  invalidateSearchIndexCache();
  const index = await ensureIndex();
  return { id: requestId, type: 'search:buildDone', payload: { termCount: searchIndexTermCount(index) } };
}

export async function handleSearchQuery(requestId: string, query: string, limit?: number): Promise<WorkerResponse> {
  const index = await ensureIndex();
  const ids = searchIndexQuery(index, query, limit);
  return { id: requestId, type: 'search:results', payload: { ids } };
}
