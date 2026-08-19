import { describe, expect, it } from 'vitest';
import { accuracyTrend, boxDistribution, neverCorrectWords, slowestWords } from './stats';
import type { ProgressRecord, SessionRecord } from '@/types/domain';

function makeProgress(overrides: Partial<ProgressRecord>): ProgressRecord {
  return {
    wordId: 'w',
    setId: 's1',
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
    origin: 'o',
    ...overrides,
  };
}

describe('boxDistribution', () => {
  it('counts words per box', () => {
    const progress = [
      makeProgress({ wordId: 'a', box: 1 }),
      makeProgress({ wordId: 'b', box: 1 }),
      makeProgress({ wordId: 'c', box: 3 }),
      makeProgress({ wordId: 'd', box: 5 }),
    ];
    expect(boxDistribution(progress)).toEqual({ 1: 2, 2: 0, 3: 1, 4: 0, 5: 1 });
  });
});

describe('slowestWords', () => {
  it('sorts descending by avgMs and excludes never-seen words', () => {
    const progress = [
      makeProgress({ wordId: 'fast', seen: 3, avgMs: 800 }),
      makeProgress({ wordId: 'slow', seen: 3, avgMs: 4000 }),
      makeProgress({ wordId: 'unseen', seen: 0, avgMs: 0 }),
    ];
    const result = slowestWords(progress);
    expect(result.map((r) => r.wordId)).toEqual(['slow', 'fast']);
  });
});

describe('neverCorrectWords', () => {
  it('finds words seen at least once but never answered correctly', () => {
    const progress = [
      makeProgress({ wordId: 'struggling', seen: 4, right: 0 }),
      makeProgress({ wordId: 'ok', seen: 4, right: 2 }),
      makeProgress({ wordId: 'untouched', seen: 0, right: 0 }),
    ];
    expect(neverCorrectWords(progress)).toEqual(['struggling']);
  });
});

describe('accuracyTrend', () => {
  it('filters to the given set, orders oldest-first, caps at the limit', () => {
    const mk = (id: string, startedAt: number, correct: number, total: number): SessionRecord => ({
      id,
      mode: 'learn',
      setIds: ['s1'],
      seed: 0,
      queue: [],
      currentIndex: total,
      answers: Array.from({ length: total }, (_, i) => ({ wordId: `w${i}`, correct: i < correct, ms: 100 })),
      startedAt,
      updatedAt: startedAt,
      origin: 'o',
    });
    const sessions = [
      mk('s1', 300, 4, 4),
      mk('s2', 100, 2, 4),
      mk('s3', 200, 1, 4),
      { ...mk('other-set', 400, 4, 4), setIds: ['s2'] },
    ];
    const trend = accuracyTrend(sessions, 's1', 2);
    expect(trend.map((t) => t.sessionId)).toEqual(['s3', 's1']); // last 2, oldest first
    expect(trend[1].accuracy).toBe(1);
  });
});
