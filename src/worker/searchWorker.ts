import type { WorkerResponse } from './protocol';

/**
 * Search-index handler stub. Real implementation (§10.7, §2): build a
 * token → sorted posting-list inverted index over term+definition plus a
 * prefix trie over terms, persist it via setSearchIndexMeta, and rebuild
 * only when the set of contentHashes changes. Budget: under 50ms at 25k
 * words (§11) — see scripts/bench.mjs.
 */
export async function handleSearchBuild(requestId: string): Promise<WorkerResponse> {
  return { id: requestId, type: 'search:buildDone', payload: { termCount: 0 } };
}

export async function handleSearchQuery(requestId: string): Promise<WorkerResponse> {
  return { id: requestId, type: 'search:results', payload: { ids: [] } };
}
