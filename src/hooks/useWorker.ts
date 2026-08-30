import { useCallback } from 'react';
import type { WorkerRequest, WorkerResponse } from '@/worker/protocol';

// Plain Omit<Union, 'id'> collapses to the *intersection* of each member's
// keys (Pick isn't distributive over unions), which drops `payload`
// entirely since it differs per request type. This distributes Omit over
// each union member first, keeping the discriminated shape intact.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type WorkerRequestInput = DistributiveOmit<WorkerRequest, 'id'>;

// One shared worker instance for the app's lifetime (§2: "A single Web
// Worker owns import parsing, search-index construction, and stats
// aggregation"). Lazily created on first use so it doesn't cost anything
// on routes that never need it.
let sharedWorker: Worker | undefined;
function getWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' });
  }
  return sharedWorker;
}

interface PendingRequest {
  resolve: (response: WorkerResponse) => void;
  onProgress?: (response: WorkerResponse) => void;
}

const pending = new Map<string, PendingRequest>();
let listenerAttached = false;

function isTerminalResponse(response: WorkerResponse): boolean {
  return response.type !== 'import:progress';
}

function ensureListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  getWorker().addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    if (!isTerminalResponse(response)) {
      entry.onProgress?.(response);
      return;
    }
    pending.delete(response.id);
    entry.resolve(response);
  });
}

/** The actual request/response bridge — a plain function so it's usable
 * both from the hook below and from scripts/bench.mjs (via the debug hook
 * at the bottom of this file), letting the bench measure raw worker
 * round-trip latency (e.g. search) without the UI's 150ms debounce in the
 * way. */
function sendWorkerRequest(
  req: WorkerRequestInput,
  onProgress?: (response: WorkerResponse) => void,
): Promise<WorkerResponse> {
  ensureListener();
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    pending.set(id, { resolve, onProgress });
    getWorker().postMessage({ ...req, id } as WorkerRequest);
  });
}

/** Promise-based request/response bridge over the typed worker protocol
 * (§2). `onProgress` receives any non-terminal responses sharing the same
 * request id (e.g. import:progress) before the returned promise settles
 * on the terminal one. */
export function useWorkerRequest() {
  const request = useCallback(sendWorkerRequest, []);
  return { request };
}

// scripts/bench.mjs's only hook into the app: lets it issue real worker
// requests (search:query timing, etc.) through the same singleton worker
// the UI uses, without the 150ms search debounce or React re-renders
// distorting the measurement. Doesn't affect app behaviour — nothing in
// the app reads this.
if (typeof window !== 'undefined') {
  (window as unknown as { __vocabLabBench?: unknown }).__vocabLabBench = { sendWorkerRequest };
}
