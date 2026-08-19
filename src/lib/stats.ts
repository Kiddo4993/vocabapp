// Pure stats aggregation (§4), computed in the worker
// (src/worker/statsWorker.ts) over a bounded per-set read, never on the
// main thread.

import type { LeitnerBox, ProgressRecord, SessionRecord, Word } from '@/types/domain';

export interface BoxDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export function boxDistribution(progress: ProgressRecord[]): BoxDistribution {
  const dist: BoxDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of progress) dist[p.box as LeitnerBox]++;
  return dist;
}

export interface AccuracyPoint {
  sessionId: string;
  startedAt: number;
  mode: string;
  accuracy: number; // 0..1
  answered: number;
}

/** Accuracy trend over the last 30 sessions touching this set (§4),
 * oldest first so it plots left-to-right naturally. */
export function accuracyTrend(sessions: SessionRecord[], setId: string, limit = 30): AccuracyPoint[] {
  const relevant = sessions
    .filter((s) => s.setIds.includes(setId) && s.answers.length > 0)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .reverse();

  return relevant.map((s) => ({
    sessionId: s.id,
    startedAt: s.startedAt,
    mode: s.mode,
    accuracy: s.answers.filter((a) => a.correct).length / s.answers.length,
    answered: s.answers.length,
  }));
}

export interface SlowWord {
  wordId: string;
  avgMs: number;
}

/** Slowest words by avgMs (§4) — only counts words that have actually been
 * seen, so a never-studied word (avgMs 0) doesn't dominate the list. */
export function slowestWords(progress: ProgressRecord[], limit = 10): SlowWord[] {
  return progress
    .filter((p) => p.seen > 0)
    .slice()
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, limit)
    .map((p) => ({ wordId: p.wordId, avgMs: p.avgMs }));
}

/** Words that have been tested at least once but never once answered
 * correctly (§4). */
export function neverCorrectWords(progress: ProgressRecord[]): string[] {
  return progress.filter((p) => p.seen > 0 && p.right === 0).map((p) => p.wordId);
}

export interface SetStats {
  setId: string;
  totalWords: number;
  boxDistribution: BoxDistribution;
  accuracyTrend: AccuracyPoint[];
  slowestWords: SlowWord[];
  neverCorrectWordIds: string[];
}

export function computeSetStats(
  setId: string,
  words: Word[],
  progress: ProgressRecord[],
  sessions: SessionRecord[],
): SetStats {
  return {
    setId,
    totalWords: words.length,
    boxDistribution: boxDistribution(progress),
    accuracyTrend: accuracyTrend(sessions, setId),
    slowestWords: slowestWords(progress),
    neverCorrectWordIds: neverCorrectWords(progress),
  };
}
