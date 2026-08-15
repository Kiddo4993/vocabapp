import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from './prng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('is deterministic and replayable from the same seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const shuffledA = shuffle(items, mulberry32(123));
    const shuffledB = shuffle(items, mulberry32(123));
    expect(shuffledA).toEqual(shuffledB);
  });

  it('does not mutate the input array', () => {
    const items = [1, 2, 3, 4, 5];
    const copy = items.slice();
    shuffle(items, mulberry32(9));
    expect(items).toEqual(copy);
  });

  it('preserves the same multiset of elements', () => {
    const items = Array.from({ length: 15 }, (_, i) => i);
    const shuffled = shuffle(items, mulberry32(55));
    expect(shuffled.slice().sort((x, y) => x - y)).toEqual(items);
  });
});
