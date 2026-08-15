import type { ImportStartPayload, WorkerResponse } from './protocol';

/**
 * Import handler stub — wired into the routing skeleton now so the message
 * contract is exercised end-to-end from Milestone 1, but the real
 * streamed/batched/resumable/delta logic (§2) lands once src/lib/parse.ts
 * exists (§10.2) and the Import screen needs it (§10.10). Fleshing this out
 * means: parse `text` via parse.ts, diff contentHash against
 * getExistingHashes, write changed words in transactions of 500 via
 * putWordsBatch, and record progress in meta via setImportOffset after each
 * batch so a killed tab resumes rather than restarting.
 */
export async function* handleImport(
  requestId: string,
  _payload: ImportStartPayload,
): AsyncGenerator<WorkerResponse> {
  yield {
    id: requestId,
    type: 'error',
    payload: { message: 'Import is not implemented yet — lands with the parser module (§10.2).' },
  };
}
