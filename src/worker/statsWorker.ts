import type { WorkerResponse } from './protocol';

/**
 * Stats aggregation handler stub. Real implementation (§10.8, §4): box
 * distribution, accuracy trend over the last 30 sessions, slowest words by
 * avgMs, words never once answered correctly — all computed off the main
 * thread since it means walking the `progress` and `sessions` stores.
 */
export async function handleStatsCompute(requestId: string): Promise<WorkerResponse> {
  return { id: requestId, type: 'stats:result', payload: {} };
}
