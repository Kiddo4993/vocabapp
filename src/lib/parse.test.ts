import { describe, expect, it } from 'vitest';
import { dedupeById, extractExamples, parseWordList, slugify, type ParsedWord } from './parse';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('  Arch Enemy  ')).toBe('arch-enemy');
    expect(slugify("usurper's")).toBe('usurper-s');
  });
});

describe('extractExamples', () => {
  it('pulls a trailing quoted sentence out of the definition', () => {
    const { definition, examples } = extractExamples(
      'to decrease in intensity. "The storm finally abated."',
    );
    expect(definition).toBe('to decrease in intensity');
    expect(examples).toEqual(['The storm finally abated.']);
  });

  it('handles curly quotes and multiple examples', () => {
    const { definition, examples } = extractExamples(
      'bold and shameless “He lied brazenly.” “She ignored the rules.”',
    );
    expect(definition).toBe('bold and shameless');
    expect(examples).toEqual(['He lied brazenly.', 'She ignored the rules.']);
  });

  it('returns the definition unchanged when there are no quotes', () => {
    const { definition, examples } = extractExamples('unusual or unconventional');
    expect(definition).toBe('unusual or unconventional');
    expect(examples).toEqual([]);
  });
});

describe('parseWordList — format 1: headword-then-gloss (Quizlet/SparkNotes export)', () => {
  it('parses a single-line tab-separated pair', () => {
    const { words, issues } = parseWordList('ethereal\tso delicate it seems otherworldly');
    expect(issues).toEqual([]);
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({
      id: 'ethereal',
      term: 'ethereal',
      definition: 'so delicate it seems otherworldly',
    });
  });

  it('parses a single-line dash-separated pair', () => {
    const { words } = parseWordList('fester - to rot or become infected');
    expect(words[0]).toMatchObject({ id: 'fester', definition: 'to rot or become infected' });
  });

  it('parses a dash-separated line correctly even when another parseable line follows it (regression)', () => {
    // A one-line "term - definition" entry's whole text is letters/spaces/
    // a hyphen, which also happens to match the bare-headword pattern —
    // this must not swallow the following line as its "gloss".
    const text = ['fester - to rot or become infected', 'avert - to turn away'].join('\n');
    const { words, issues } = parseWordList(text);
    expect(issues).toEqual([]);
    expect(words).toHaveLength(2);
    expect(words[0]).toMatchObject({ id: 'fester', definition: 'to rot or become infected' });
    expect(words[1]).toMatchObject({ id: 'avert', definition: 'to turn away' });
  });

  it('parses a two-line headword/gloss pair', () => {
    const { words, issues } = parseWordList('eccentric\nunusual or unconventional in behaviour');
    expect(issues).toEqual([]);
    expect(words[0]).toMatchObject({
      id: 'eccentric',
      term: 'eccentric',
      definition: 'unusual or unconventional in behaviour',
    });
  });

  it('extracts an example sentence embedded in the gloss', () => {
    const { words } = parseWordList(
      'brazenly\tboldly and shamelessly. "He brazenly lied."',
    );
    expect(words[0].definition).toBe('boldly and shamelessly');
    expect(words[0].examples).toEqual(['He brazenly lied.']);
  });
});

describe('parseWordList — format 2: inline word (pos) - meaning', () => {
  it('parses term, pos, and meaning on one line', () => {
    const { words, issues } = parseWordList('arch (adj.) - deliberately teasing in a knowing way');
    expect(issues).toEqual([]);
    expect(words[0]).toMatchObject({
      id: 'arch',
      term: 'arch',
      pos: 'adj.',
      definition: 'deliberately teasing in a knowing way',
    });
  });

  it('accepts a colon separator too', () => {
    const { words } = parseWordList('flippant (adjective): not showing enough seriousness');
    expect(words[0]).toMatchObject({ pos: 'adjective', definition: 'not showing enough seriousness' });
  });
});

describe('parseWordList — format 3: numbered multi-sense glosses', () => {
  it('splits multiple numbered senses under one headword', () => {
    const text = [
      'mercurial',
      '1. (adj.) subject to sudden or unpredictable changes of mood',
      '2. (adj.) relating to the planet Mercury',
    ].join('\n');
    const { words, issues } = parseWordList(text);
    expect(issues).toEqual([]);
    expect(words).toHaveLength(1);
    const w = words[0];
    expect(w.id).toBe('mercurial');
    // First sense becomes the primary definition/pos.
    expect(w.pos).toBe('adj.');
    expect(w.definition).toBe('subject to sudden or unpredictable changes of mood');
    // Remaining senses land in `senses`.
    expect(w.senses).toHaveLength(1);
    expect(w.senses[0]).toMatchObject({ pos: 'adj.', definition: 'relating to the planet Mercury' });
  });

  it('handles three or more senses and senses without a pos tag', () => {
    const text = ['bank', '1. a financial institution', '2. the side of a river', '3. to tilt while turning'].join(
      '\n',
    );
    const { words } = parseWordList(text);
    expect(words[0].senses).toHaveLength(2);
    expect(words[0].senses.map((s) => s.definition)).toEqual(['the side of a river', 'to tilt while turning']);
  });
});

describe('parseWordList — example extraction across formats', () => {
  it('extracts examples from an inline-pos entry', () => {
    const { words } = parseWordList(
      'satire (noun) - using humor to criticize. "The show uses satire to mock politicians."',
    );
    expect(words[0].examples).toEqual(['The show uses satire to mock politicians.']);
  });

  it('extracts examples from a numbered-sense entry', () => {
    const text = ['scourge', '1. a source of great suffering. "Disease was the scourge of the village."'].join('\n');
    const { words } = parseWordList(text);
    expect(words[0].examples).toEqual(['Disease was the scourge of the village.']);
  });
});

describe('parseWordList — dedupe-by-id keeping the richer entry', () => {
  it('keeps the entry with more content when the same id appears twice', () => {
    const text = [
      'yield\tto produce',
      'yield\tto produce something, or to give way and surrender. "The farm yielded a large harvest."',
    ].join('\n');
    const { words } = parseWordList(text);
    expect(words).toHaveLength(1);
    expect(words[0].examples).toEqual(['The farm yielded a large harvest.']);
    expect(words[0].definition.length).toBeGreaterThan('to produce'.length);
  });

  it('prefers an entry with senses over one without, regardless of order', () => {
    const richer: ParsedWord = {
      id: 'bank',
      term: 'bank',
      definition: 'a financial institution',
      examples: [],
      senses: [{ definition: 'the side of a river', examples: [] }],
      sourceLine: 1,
    };
    const plainer: ParsedWord = {
      id: 'bank',
      term: 'bank',
      definition: 'a financial institution',
      examples: [],
      senses: [],
      sourceLine: 2,
    };
    expect(dedupeById([plainer, richer])).toEqual([richer]);
    expect(dedupeById([richer, plainer])).toEqual([richer]);
  });

  it('is stable (keeps first-seen) on an exact tie', () => {
    const a: ParsedWord = { id: 'x', term: 'x', definition: 'same', examples: [], senses: [], sourceLine: 1 };
    const b: ParsedWord = { id: 'x', term: 'x', definition: 'same', examples: [], senses: [], sourceLine: 2 };
    expect(dedupeById([a, b])).toEqual([a]);
  });
});

describe('parseWordList — REVIEW output for garbage', () => {
  it('routes unparseable lines to issues instead of dropping them', () => {
    const text = ['ethereal\tso delicate it seems otherworldly', '???', '42 !! not a word at all ##'].join('\n');
    const { words, issues } = parseWordList(text);
    expect(words).toHaveLength(1);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ line: 2, raw: '???' });
    expect(issues[1]).toMatchObject({ line: 3, raw: '42 !! not a word at all ##' });
  });

  it('skips blank lines and comment lines without flagging them', () => {
    const text = ['# a comment', '', 'arch (adj.) - deliberately teasing', '', '# trailing comment'].join('\n');
    const { words, issues } = parseWordList(text);
    expect(words).toHaveLength(1);
    expect(issues).toEqual([]);
  });

  it('reports the correct 1-based line number for a mid-file garbage line', () => {
    const text = ['fester - to rot', '', '~~~garbage~~~', 'avert - to turn away'].join('\n');
    const { issues } = parseWordList(text);
    expect(issues).toEqual([{ line: 3, raw: '~~~garbage~~~', reason: 'unrecognised format' }]);
  });
});
