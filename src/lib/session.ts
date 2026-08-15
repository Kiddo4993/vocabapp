import { mulberry32, shuffle, type RNG } from './prng';
import type { Word } from '@/types/domain';

export const MAX_SESSION_QUEUE = 20;

/** Builds a session's word-id queue from a due-id pool, seeded (§2
 * determinism) and bounded to at most 20 items. */
export function buildSessionQueue(dueIds: string[], seed: number, max = MAX_SESSION_QUEUE): string[] {
  const rng = mulberry32(seed);
  return shuffle(dueIds, rng).slice(0, max);
}

/** Picks `count` distractors from `pool` (excluding the correct word),
 * driven by a caller-supplied RNG so multiple-choice option order is
 * reproducible within a seeded session. */
export function pickDistractors(pool: Word[], correctId: string, count: number, rng: RNG): Word[] {
  const candidates = pool.filter((w) => w.id !== correctId);
  return shuffle(candidates, rng).slice(0, Math.min(count, candidates.length));
}

/** Builds a shuffled option list (1 correct + N distractors) for a
 * multiple-choice question, returning the options and the correct index. */
export function buildMultipleChoiceOptions(
  correct: Word,
  pool: Word[],
  distractorCount: number,
  rng: RNG,
): { options: Word[]; correctIndex: number } {
  const distractors = pickDistractors(pool, correct.id, distractorCount, rng);
  const options = shuffle([correct, ...distractors], rng);
  return { options, correctIndex: options.findIndex((w) => w.id === correct.id) };
}
