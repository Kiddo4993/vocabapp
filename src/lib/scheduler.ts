// Five-box Leitner scheduler — pure functions only, no DB/framework
// dependency, so it's trivially unit-testable and safe to call from the UI
// thread, the worker, or a test (§3: "the engine under everything").
//
// Box intervals: box 1 = same session, then 1, 3, 7, 21 days. A miss always
// drops a word to box 1. Tier escalates recognise -> recall -> produce in
// lockstep with box promotion (§3 Learn: "a word only advances a box after
// answering correctly at its current tier"), and resets to recognise on a
// miss along with the box.

import type { LeitnerBox, ProgressRecord, QuestionTier } from '@/types/domain';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const BOX_INTERVALS_MS: Record<LeitnerBox, number> = {
  1: 0,
  2: 1 * DAY_MS,
  3: 3 * DAY_MS,
  4: 7 * DAY_MS,
  5: 21 * DAY_MS,
};

const TIER_ORDER: QuestionTier[] = ['recognise', 'recall', 'produce'];

export function nextTier(tier: QuestionTier): QuestionTier {
  const idx = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)];
}

function promoteBox(box: LeitnerBox): LeitnerBox {
  return Math.min(box + 1, 5) as LeitnerBox;
}

export interface AnswerInput {
  correct: boolean;
  /** epoch ms "now" — passed explicitly (never Date.now() internally) so
   * scheduling is deterministic and testable across day boundaries. */
  now: number;
  /** how long the answer took, ms — folded into the running avgMs. */
  ms: number;
  /** which wrong option was picked, if this was a miss in a
   * multiple-choice-shaped mode — feeds missedAgainst (§3/§4 confusion
   * pairs). Ignored when `correct` is true. */
  distractorId?: string;
  origin: string;
}

/** Applies one answer to a progress record and returns the next state.
 * Never mutates the input. */
export function applyAnswer(progress: ProgressRecord, input: AnswerInput): ProgressRecord {
  const { correct, now, ms, distractorId, origin } = input;

  const seen = progress.seen + 1;
  const avgMs = progress.seen === 0 ? ms : (progress.avgMs * progress.seen + ms) / seen;

  if (correct) {
    const box = promoteBox(progress.box);
    return {
      ...progress,
      box,
      due: now + BOX_INTERVALS_MS[box],
      tier: nextTier(progress.tier),
      right: progress.right + 1,
      seen,
      lastSeen: now,
      avgMs,
      updatedAt: now,
      origin,
    };
  }

  const missedAgainst = { ...progress.missedAgainst };
  if (distractorId) {
    missedAgainst[distractorId] = (missedAgainst[distractorId] ?? 0) + 1;
  }

  return {
    ...progress,
    box: 1,
    due: now, // box 1 = same session — immediately eligible again
    tier: 'recognise',
    wrong: progress.wrong + 1,
    seen,
    lastSeen: now,
    avgMs,
    missedAgainst,
    updatedAt: now,
    origin,
  };
}

/** True if a progress record is due for review as of `now`. Thin wrapper
 * kept alongside applyAnswer so scheduler.test.ts can exercise the
 * due/box/tier relationship as one unit; src/db/progress.ts uses the
 * [setId+due] index directly for the bulk case instead of calling this in
 * a loop. */
export function isDue(progress: ProgressRecord, now: number): boolean {
  return progress.due <= now;
}
