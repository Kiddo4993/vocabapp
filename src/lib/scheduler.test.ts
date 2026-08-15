import { describe, expect, it } from 'vitest';
import type { ProgressRecord } from '@/types/domain';
import { applyAnswer, BOX_INTERVALS_MS, DAY_MS, isDue, nextTier } from './scheduler';

const ORIGIN = 'device-test';

function makeProgress(overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    wordId: 'arch',
    setId: 'tone-and-manner',
    box: 1,
    due: 0,
    tier: 'recognise',
    right: 0,
    wrong: 0,
    seen: 0,
    lastSeen: 0,
    avgMs: 0,
    starred: false,
    missedAgainst: {},
    updatedAt: 0,
    origin: ORIGIN,
    ...overrides,
  };
}

describe('box promotion', () => {
  it('promotes box 1 -> 2 on a correct answer, due in 1 day', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const next = applyAnswer(makeProgress({ box: 1 }), { correct: true, now, ms: 1200, origin: ORIGIN });
    expect(next.box).toBe(2);
    expect(next.due).toBe(now + BOX_INTERVALS_MS[2]);
    expect(next.due).toBe(now + DAY_MS);
  });

  it('promotes sequentially through every box on repeated correct answers', () => {
    let progress = makeProgress({ box: 1 });
    let now = Date.UTC(2026, 0, 1);
    const expectedBoxes = [2, 3, 4, 5];
    for (const expectedBox of expectedBoxes) {
      progress = applyAnswer(progress, { correct: true, now, ms: 1000, origin: ORIGIN });
      expect(progress.box).toBe(expectedBox);
      now = progress.due; // next review happens right at (or after) its due date
    }
  });

  it('caps at box 5 — further correct answers do not overflow the Leitner system', () => {
    const now = Date.UTC(2026, 0, 1);
    const next = applyAnswer(makeProgress({ box: 5, due: now - 1000 }), {
      correct: true,
      now,
      ms: 900,
      origin: ORIGIN,
    });
    expect(next.box).toBe(5);
    expect(next.due).toBe(now + BOX_INTERVALS_MS[5]);
  });

  it('increments right/seen and updates avgMs on a correct answer', () => {
    const now = Date.UTC(2026, 0, 1);
    const progress = makeProgress({ right: 2, wrong: 1, seen: 3, avgMs: 1000 });
    const next = applyAnswer(progress, { correct: true, now, ms: 2000, origin: ORIGIN });
    expect(next.right).toBe(3);
    expect(next.wrong).toBe(1);
    expect(next.seen).toBe(4);
    expect(next.avgMs).toBe((1000 * 3 + 2000) / 4);
    expect(next.lastSeen).toBe(now);
  });
});

describe('demotion to box 1 on a miss', () => {
  it('drops any box straight to 1 on a miss', () => {
    for (const startBox of [2, 3, 4, 5] as const) {
      const now = Date.UTC(2026, 0, 1);
      const next = applyAnswer(makeProgress({ box: startBox }), { correct: false, now, ms: 3000, origin: ORIGIN });
      expect(next.box).toBe(1);
    }
  });

  it('sets due = now on a miss (box 1 = same session)', () => {
    const now = Date.UTC(2026, 0, 1, 9, 30);
    const next = applyAnswer(makeProgress({ box: 4, due: now + 7 * DAY_MS }), {
      correct: false,
      now,
      ms: 4000,
      origin: ORIGIN,
    });
    expect(next.due).toBe(now);
  });

  it('increments wrong/seen but not right', () => {
    const now = Date.UTC(2026, 0, 1);
    const progress = makeProgress({ right: 5, wrong: 0, seen: 5 });
    const next = applyAnswer(progress, { correct: false, now, ms: 1500, origin: ORIGIN });
    expect(next.right).toBe(5);
    expect(next.wrong).toBe(1);
    expect(next.seen).toBe(6);
  });

  it('records which distractor was picked in missedAgainst', () => {
    const now = Date.UTC(2026, 0, 1);
    const progress = makeProgress({ missedAgainst: { squirming: 1 } });
    const next = applyAnswer(progress, {
      correct: false,
      now,
      ms: 2000,
      distractorId: 'squirming',
      origin: ORIGIN,
    });
    expect(next.missedAgainst).toEqual({ squirming: 2 });
  });

  it('does not mutate the missedAgainst map of the input record', () => {
    const now = Date.UTC(2026, 0, 1);
    const progress = makeProgress({ missedAgainst: { squirming: 1 } });
    applyAnswer(progress, { correct: false, now, ms: 2000, distractorId: 'squirming', origin: ORIGIN });
    expect(progress.missedAgainst).toEqual({ squirming: 1 });
  });
});

describe('due-date maths across day boundaries', () => {
  it('crosses midnight correctly for the 1-day interval', () => {
    const now = Date.UTC(2026, 0, 31, 23, 30); // Jan 31, 23:30 UTC
    const next = applyAnswer(makeProgress({ box: 1 }), { correct: true, now, ms: 1000, origin: ORIGIN });
    const due = new Date(next.due);
    expect(due.getUTCMonth()).toBe(1); // February
    expect(due.getUTCDate()).toBe(1);
    expect(due.getUTCHours()).toBe(23);
    expect(due.getUTCMinutes()).toBe(30);
  });

  it('crosses a month/year boundary correctly for the 21-day interval', () => {
    const now = Date.UTC(2025, 11, 25); // Dec 25, 2025
    const next = applyAnswer(makeProgress({ box: 4 }), { correct: true, now, ms: 1000, origin: ORIGIN });
    expect(next.box).toBe(5);
    const due = new Date(next.due);
    expect(due.getUTCFullYear()).toBe(2026);
    expect(due.getUTCMonth()).toBe(0); // January
    expect(due.getUTCDate()).toBe(15); // Dec 25 + 21 days = Jan 15
  });

  it('is exact millisecond arithmetic, not calendar-day rounding', () => {
    const now = Date.UTC(2026, 5, 15, 13, 47, 22, 500);
    const next = applyAnswer(makeProgress({ box: 2 }), { correct: true, now, ms: 1000, origin: ORIGIN });
    expect(next.due - now).toBe(BOX_INTERVALS_MS[3]);
  });

  it('isDue is inclusive of the exact due timestamp and respects the boundary', () => {
    const due = Date.UTC(2026, 0, 2);
    const progress = makeProgress({ due });
    expect(isDue(progress, due)).toBe(true);
    expect(isDue(progress, due - 1)).toBe(false);
    expect(isDue(progress, due + 1)).toBe(true);
  });
});

describe('tier escalation in Learn', () => {
  it('escalates recognise -> recall -> produce on consecutive correct answers', () => {
    expect(nextTier('recognise')).toBe('recall');
    expect(nextTier('recall')).toBe('produce');
  });

  it('stays at produce once mastered (no tier beyond produce)', () => {
    expect(nextTier('produce')).toBe('produce');
  });

  it('advances tier alongside box on a correct answer', () => {
    const now = Date.UTC(2026, 0, 1);
    let progress = makeProgress({ box: 1, tier: 'recognise' });
    progress = applyAnswer(progress, { correct: true, now, ms: 1000, origin: ORIGIN });
    expect(progress.tier).toBe('recall');
    progress = applyAnswer(progress, { correct: true, now: progress.due, ms: 1000, origin: ORIGIN });
    expect(progress.tier).toBe('produce');
    // A word only advances a box after answering correctly at its current
    // tier (§3) — once at produce, further correct answers keep it there.
    progress = applyAnswer(progress, { correct: true, now: progress.due, ms: 1000, origin: ORIGIN });
    expect(progress.tier).toBe('produce');
    expect(progress.box).toBe(4);
  });

  it('resets tier to recognise on a miss, same as the box reset', () => {
    const now = Date.UTC(2026, 0, 1);
    const progress = makeProgress({ box: 4, tier: 'produce' });
    const next = applyAnswer(progress, { correct: false, now, ms: 1000, origin: ORIGIN });
    expect(next.tier).toBe('recognise');
    expect(next.box).toBe(1);
  });
});
