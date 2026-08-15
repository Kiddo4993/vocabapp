import { describe, expect, it } from 'vitest';
import { isCloseEnough, levenshtein } from './levenshtein';

describe('levenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('arch', 'arch')).toBe(0);
  });
  it('counts a single substitution', () => {
    expect(levenshtein('arch', 'arcs')).toBe(1);
  });
  it('counts insertions and deletions', () => {
    expect(levenshtein('arch', 'arche')).toBe(1);
    expect(levenshtein('arche', 'arch')).toBe(1);
  });
  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('isCloseEnough (Write mode typo forgiveness)', () => {
  it('accepts an exact match', () => {
    expect(isCloseEnough('brazenly', 'brazenly')).toBe(true);
  });

  it('forgives a one-character typo on a word longer than five characters', () => {
    expect(isCloseEnough('brazenli', 'brazenly')).toBe(true);
    expect(isCloseEnough('brazenl', 'brazenly')).toBe(true); // one deletion
  });

  it('rejects a two-character-distant guess even on a long word', () => {
    expect(isCloseEnough('brazenlx', 'brazenly')).toBe(true); // 1 sub — still close
    expect(isCloseEnough('brazenxx', 'brazenly')).toBe(false); // 2 subs — too far
  });

  it('does not forgive typos on words of five characters or fewer', () => {
    expect(isCloseEnough('arcs', 'arch')).toBe(false);
    expect(isCloseEnough('yield', 'yield')).toBe(true); // exact still fine at length 5
    expect(isCloseEnough('yeild', 'yield')).toBe(false); // typo on a 5-char word: not forgiven
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isCloseEnough('  Brazenly  ', 'brazenly')).toBe(true);
  });
});
