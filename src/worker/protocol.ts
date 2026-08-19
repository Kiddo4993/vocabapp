// The one typed message contract the UI thread and the worker speak over
// (§2). A single worker owns import parsing, search-index construction, and
// stats aggregation — nothing large ever touches the main thread.
//
// Every request carries a nonce `id` for request/response correlation (see
// src/hooks/useWorker.ts, built alongside the UI in a later milestone).
// Long-running requests (import) may emit multiple responses sharing that
// same `id` — zero or more progress events, then exactly one terminal event
// (`done` or `error`).

export interface ImportStartPayload {
  /** stable id for this import job, used as the meta resume-offset key
   * (§2 resumable import) — callers should derive it from the source text
   * + setId so retrying the same file resumes rather than restarts. */
  jobId: string;
  setId: string;
  setName: string;
  text: string;
  origin: string;
}

export type WorkerRequest =
  | { id: string; type: 'ping' }
  | { id: string; type: 'import:start'; payload: ImportStartPayload }
  | { id: string; type: 'search:build' }
  | { id: string; type: 'search:query'; payload: { query: string; limit?: number } }
  | { id: string; type: 'stats:compute'; payload: { setId: string } };

// Kept as `unknown` here (rather than importing SetStats/ConfusionPair
// from src/lib/stats.ts and src/lib/confusion.ts) so protocol.ts stays a
// leaf module with zero dependencies of its own — callers on both sides
// already import those types directly where they need the real shape.
export interface StatsResultPayload {
  stats: unknown; // SetStats
  confusionPairs: unknown[]; // ConfusionPair[]
}

export type WorkerResponse =
  | { id: string; type: 'pong' }
  | { id: string; type: 'import:progress'; payload: { processed: number; total: number } }
  | {
      id: string;
      type: 'import:done';
      payload: { written: number; skipped: number; reviewLines: number };
    }
  | { id: string; type: 'search:buildDone'; payload: { termCount: number } }
  | { id: string; type: 'search:results'; payload: { ids: string[] } }
  | { id: string; type: 'stats:result'; payload: StatsResultPayload }
  | { id: string; type: 'error'; payload: { message: string } };

export function isTerminal(response: WorkerResponse): boolean {
  return (
    response.type === 'pong' ||
    response.type === 'import:done' ||
    response.type === 'search:buildDone' ||
    response.type === 'search:results' ||
    response.type === 'stats:result' ||
    response.type === 'error'
  );
}
