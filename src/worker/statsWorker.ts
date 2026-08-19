import { getAllProgressForSet } from '@/db/progress';
import { getRecentSessionsForSet } from '@/db/sessions';
import { getWordsBySetPage } from '@/db/words';
import { computeConfusionPairs } from '@/lib/confusion';
import { computeSetStats } from '@/lib/stats';
import type { WorkerResponse } from './protocol';

const STATS_WORD_LIMIT = 500;

/** Stats aggregation (§4/§10.8) — box distribution, accuracy trend over
 * the last 30 sessions, slowest words, words never once answered
 * correctly, plus confusion pairs — all computed off the main thread. */
export async function handleStatsCompute(requestId: string, setId: string): Promise<WorkerResponse> {
  const [wordsPage, progress, sessions] = await Promise.all([
    getWordsBySetPage(setId, { limit: STATS_WORD_LIMIT }),
    getAllProgressForSet(setId),
    getRecentSessionsForSet(setId),
  ]);

  const stats = computeSetStats(setId, wordsPage.items, progress, sessions);
  const confusionPairs = computeConfusionPairs(wordsPage.items, progress);

  return { id: requestId, type: 'stats:result', payload: { stats, confusionPairs } };
}
