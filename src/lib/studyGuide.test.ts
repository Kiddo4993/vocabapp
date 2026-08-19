import { describe, expect, it } from 'vitest';
import { generateStudyGuideHtml, generateStudyGuideMarkdown, type StudyGuideInput } from './studyGuide';
import type { Word } from '@/types/domain';

function makeWord(overrides: Partial<Word> & { id: string; term: string; definition: string }): Word {
  return {
    setId: 's1',
    examples: [],
    synonyms: [],
    antonyms: [],
    senses: [],
    aliases: [],
    contentHash: '',
    updatedAt: 0,
    origin: 'o',
    ...overrides,
  };
}

const INPUT: StudyGuideInput = {
  sets: [
    {
      id: 'tone-and-manner',
      name: 'Tone & Manner',
      words: [
        makeWord({
          id: 'arch',
          term: 'arch',
          pos: 'adj.',
          definition: 'Deliberately teasing in a knowing, playful way.',
          examples: ['She shot him an arch look.'],
          synonyms: ['playful', 'teasing'],
        }),
        makeWord({ id: 'flippant', term: 'flippant', pos: 'adjective', definition: 'Not showing enough seriousness.' }),
      ],
    },
  ],
  confusionPairs: [{ a: 'arch', b: 'flippant', source: 'missed', missedCount: 1 }],
};

describe('generateStudyGuideMarkdown', () => {
  it('groups words by set (theme) under a heading', () => {
    const md = generateStudyGuideMarkdown(INPUT);
    expect(md).toContain('## Tone & Manner');
    expect(md).toContain('### arch (adj.)');
    expect(md).toContain('### flippant (adjective)');
  });

  it('includes examples and synonyms', () => {
    const md = generateStudyGuideMarkdown(INPUT);
    expect(md).toContain('She shot him an arch look.');
    expect(md).toContain('**Synonyms:** playful, teasing');
  });

  it('calls out confusion pairs by term', () => {
    const md = generateStudyGuideMarkdown(INPUT);
    expect(md).toContain('## Confusion Pairs');
    expect(md).toContain('**arch** vs **flippant**');
  });

  it('includes a quick-reference table with every word', () => {
    const md = generateStudyGuideMarkdown(INPUT);
    expect(md).toContain('## Quick Reference');
    expect(md).toContain('| arch | adj. |');
    expect(md).toContain('| flippant | adjective |');
  });
});

describe('generateStudyGuideHtml', () => {
  it('produces valid-looking print-friendly HTML with the same content', () => {
    const html = generateStudyGuideHtml(INPUT);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Tone &amp; Manner');
    expect(html).toContain('arch');
    expect(html).toContain('Confusion Pairs');
    expect(html).toContain('<table>');
    expect(html).toContain('@media print');
  });

  it('escapes HTML-special characters in word content', () => {
    const input: StudyGuideInput = {
      sets: [
        {
          id: 's',
          name: 'Set <X>',
          words: [makeWord({ id: 'w', term: 'a & b', definition: '<script>alert(1)</script>' })],
        },
      ],
      confusionPairs: [],
    };
    const html = generateStudyGuideHtml(input);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
