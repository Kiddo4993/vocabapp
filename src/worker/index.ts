// Worker entry point — routes every WorkerRequest (§2 typed protocol) to
// its handler and posts back WorkerResponse messages. This is the only
// place import parsing, search-index construction, and stats aggregation
// run; the UI thread never does this work itself.

import type { WorkerRequest, WorkerResponse } from './protocol';
import { handleImport } from './importWorker';
import { handleSearchBuild, handleSearchQuery } from './searchWorker';
import { handleStatsCompute } from './statsWorker';

function post(response: WorkerResponse) {
  (self as unknown as Worker).postMessage(response);
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  void handleRequest(request).catch((err: unknown) => {
    post({
      id: request.id,
      type: 'error',
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  });
});

async function handleRequest(request: WorkerRequest): Promise<void> {
  switch (request.type) {
    case 'ping':
      post({ id: request.id, type: 'pong' });
      return;

    case 'import:start':
      for await (const response of handleImport(request.id, request.payload)) {
        post(response);
      }
      return;

    case 'search:build':
      post(await handleSearchBuild(request.id));
      return;

    case 'search:query':
      post(await handleSearchQuery(request.id, request.payload.query, request.payload.limit));
      return;

    case 'stats:compute':
      post(await handleStatsCompute(request.id));
      return;

    default: {
      // Exhaustiveness check — if this fires, protocol.ts grew a request
      // type that isn't routed here yet.
      const _exhaustive: never = request;
      throw new Error(`Unhandled worker request: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
