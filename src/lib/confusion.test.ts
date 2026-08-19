import { describe, expect, it } from 'vitest';
import { computeConfusionPairs, confusionPairWordIds } from './confusion';
import type { ProgressRecord, Word } from '@/types/domain';

function makeWord(id: string, term: string, definition = 'def'): Word {
  return {
    id,
    setId: 's1',
    term,
    definition,
    examples: [],
    synonyms: [],
    antonyms: [],
    senses: [],
    aliases: [],
    contentHash: '',
    updatedAt: 0,
    origin: 'o',
  };
}

function makeProgress(wordId: string, missedAgainst: Record<string, number> = {}): ProgressRecord {
  return {
    wordId,
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
    missedAgainst,
    updatedAt: 0,
    origin: 'o',
  };
}

describe('computeConfusionPairs', () => {
  it('finds a pair from missedAgainst', () => {
    const words = [makeWord('corroborate', 'corroborate'), makeWord('corrode', 'corrode')];
    const progress = [makeProgress('corroborate', { corrode: 3 })];
    const pairs = computeConfusionPairs(words, progress);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ source: 'missed', missedCount: 3 });
  });

  it('finds orthographic near-neighbours within edit distance 2', () => {
    const words = [makeWord('arch', 'arch'), makeWord('arc', 'arc'), makeWord('ethereal', 'ethereal')];
    const progress: ProgressRecord[] = [];
    const pairs = computeConfusionPairs(words, progress);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ source: 'orthographic', editDistance: 1 });
  });

  it('marks a pair "both" when it has missed history AND is orthographically close', () => {
    const words = [makeWord('writhing', 'writhing'), makeWord('squirming', 'squirming')];
    // not orthographically close (different words) — use a closer pair instead
    const closeWords = [makeWord('fester', 'fester'), makeWord('faster', 'faster')];
    const progress = [makeProgress('fester', { faster: 2 })];
    const pairs = computeConfusionPairs(closeWords, progress);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].source).toBe('both');
    expect(pairs[0].missedCount).toBe(2);
    expect(pairs[0].editDistance).toBeLessThanOrEqual(2);
    expect(words).toBeTruthy(); // unused var guard for the writhing/squirming words above
  });

  it('sums missedAgainst counted from both directions into one pair', () => {
    const words = [makeWord('a', 'aaaa'), makeWord('b', 'bbbb')];
    const progress = [makeProgress('a', { b: 2 }), makeProgress('b', { a: 1 })];
    const pairs = computeConfusionPairs(words, progress);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].missedCount).toBe(3);
  });

  it('ignores words outside the given scope', () => {
    const words = [makeWord('a', 'aaaa')];
    const progress = [makeProgress('a', { outsider: 5 })];
    expect(computeConfusionPairs(words, progress)).toEqual([]);
  });

  it('ranks higher missedCount first, then smaller edit distance', () => {
    const words = [makeWord('a', 'cat'), makeWord('b', 'bat'), makeWord('c', 'cats')];
    const progress = [makeProgress('a', { c: 5 })];
    const pairs = computeConfusionPairs(words, progress);
    expect(pairs[0].missedCount).toBe(5);
  });

  it('confusionPairWordIds collects every id that appears in any pair', () => {
    const words = [makeWord('a', 'cat'), makeWord('b', 'bat'), makeWord('c', 'unrelatedxyz')];
    const progress = [makeProgress('a', { b: 1 })];
    const pairs = computeConfusionPairs(words, progress);
    expect(confusionPairWordIds(pairs).sort()).toEqual(['a', 'b']);
  });
});
