import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchIndexQuery } from './searchIndex';

const WORDS = [
  { id: 'arch', term: 'arch', definition: 'Deliberately teasing in a knowing, playful way.' },
  { id: 'archaic', term: 'archaic', definition: 'Very old or old-fashioned.' },
  { id: 'ethereal', term: 'ethereal', definition: 'So delicate it seems otherworldly.' },
  { id: 'playful-note', term: 'whimsy', definition: 'A playful or fanciful idea.' },
];

describe('searchIndex', () => {
  it('matches an exact term', () => {
    const index = buildSearchIndex(WORDS);
    expect(searchIndexQuery(index, 'arch')).toContain('arch');
  });

  it('prefix-matches a partial term via the trie', () => {
    const index = buildSearchIndex(WORDS);
    const results = searchIndexQuery(index, 'arc');
    expect(results).toEqual(expect.arrayContaining(['arch', 'archaic']));
  });

  it('ranks term-prefix matches ahead of definition-only matches', () => {
    const index = buildSearchIndex(WORDS);
    const results = searchIndexQuery(index, 'arch');
    // 'arch' and 'archaic' (term prefix) should both precede anything
    // that only matched via definition tokens.
    expect(results.indexOf('arch')).toBeLessThan(results.length);
    expect(results[0]).toBe('arch');
  });

  it('matches a definition token even when the term differs', () => {
    const index = buildSearchIndex(WORDS);
    const results = searchIndexQuery(index, 'playful');
    expect(results).toEqual(expect.arrayContaining(['arch', 'playful-note']));
  });

  it('returns nothing for an empty query', () => {
    const index = buildSearchIndex(WORDS);
    expect(searchIndexQuery(index, '   ')).toEqual([]);
  });

  it('returns nothing for a query with no matches', () => {
    const index = buildSearchIndex(WORDS);
    expect(searchIndexQuery(index, 'zzzznotfound')).toEqual([]);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `w${i}`,
      term: `apple${i}`,
      definition: 'a fruit',
    }));
    const index = buildSearchIndex(many);
    expect(searchIndexQuery(index, 'apple', 5)).toHaveLength(5);
  });
});
