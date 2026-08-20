import { describe, expect, it } from 'vitest';
import { applyEnrichmentSuggestion, missingFields, needsEnrichment } from './enrichmentService';
import type { Word } from '@/types/domain';

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 'w',
    setId: 's',
    term: 'w',
    definition: 'a definition',
    examples: [],
    synonyms: [],
    antonyms: [],
    senses: [],
    aliases: [],
    contentHash: 'abc',
    updatedAt: 0,
    origin: 'o',
    ...overrides,
  };
}

describe('missingFields / needsEnrichment', () => {
  it('flags a fully-authored word as needing nothing', () => {
    const w = makeWord({ simple: 'plain gloss', examples: ['ex'], synonyms: ['syn'] });
    expect(missingFields(w)).toEqual({ simple: false, examples: false, synonyms: false });
    expect(needsEnrichment(w)).toBe(false);
  });

  it('flags missing simple/examples/synonyms independently', () => {
    const w = makeWord({ simple: 'has a gloss', examples: [], synonyms: ['syn'] });
    expect(missingFields(w)).toEqual({ simple: false, examples: true, synonyms: false });
    expect(needsEnrichment(w)).toBe(true);
  });
});

describe('applyEnrichmentSuggestion', () => {
  it('fills genuinely empty fields', () => {
    const w = makeWord({ examples: [], synonyms: [] });
    const next = applyEnrichmentSuggestion(w, { simple: 'plain', examples: ['ex1'], synonyms: ['a', 'b'] }, 'device-x');
    expect(next.simple).toBe('plain');
    expect(next.examples).toEqual(['ex1']);
    expect(next.synonyms).toEqual(['a', 'b']);
    expect(next.contentHash).not.toBe(w.contentHash);
  });

  it('never overwrites an already-authored field, even if a suggestion is offered for it', () => {
    const w = makeWord({ simple: 'authored gloss', examples: ['authored example'], synonyms: ['authored-syn'] });
    const next = applyEnrichmentSuggestion(
      w,
      { simple: 'AI gloss', examples: ['AI example'], synonyms: ['ai-syn'] },
      'device-x',
    );
    expect(next.simple).toBe('authored gloss');
    expect(next.examples).toEqual(['authored example']);
    expect(next.synonyms).toEqual(['authored-syn']);
  });

  it('leaves a field empty when no suggestion is offered for it', () => {
    const w = makeWord({ examples: [] });
    const next = applyEnrichmentSuggestion(w, {}, 'device-x');
    expect(next.examples).toEqual([]);
  });
});
