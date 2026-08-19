// Study guide generator (§4): pick sets, get a guide with words grouped by
// theme (set), confusion pairs called out, and a quick-reference table.
// Pure string builders — Markdown and print-friendly HTML — so they're
// testable without touching the DOM or the DB.

import type { ConfusionPair } from './confusion';
import type { Word } from '@/types/domain';

export interface StudyGuideSet {
  id: string;
  name: string;
  words: Word[];
}

export interface StudyGuideInput {
  sets: StudyGuideSet[];
  confusionPairs: ConfusionPair[];
}

function findWord(sets: StudyGuideSet[], id: string): Word | undefined {
  for (const s of sets) {
    const w = s.words.find((w) => w.id === id);
    if (w) return w;
  }
  return undefined;
}

export function generateStudyGuideMarkdown(input: StudyGuideInput): string {
  const lines: string[] = ['# Study Guide', ''];

  for (const set of input.sets) {
    lines.push(`## ${set.name}`, '');
    for (const w of set.words) {
      lines.push(`### ${w.term}${w.pos ? ` (${w.pos})` : ''}`);
      lines.push(w.definition);
      if (w.simple) lines.push(`> ${w.simple}`);
      for (const ex of w.examples) lines.push(`- *"${ex}"*`);
      if (w.synonyms.length) lines.push(`**Synonyms:** ${w.synonyms.join(', ')}`);
      if (w.antonyms.length) lines.push(`**Antonyms:** ${w.antonyms.join(', ')}`);
      if (w.notes) lines.push(`**Note:** ${w.notes}`);
      lines.push('');
    }
  }

  if (input.confusionPairs.length > 0) {
    lines.push('## Confusion Pairs', '');
    for (const pair of input.confusionPairs) {
      const wa = findWord(input.sets, pair.a);
      const wb = findWord(input.sets, pair.b);
      if (!wa || !wb) continue;
      lines.push(`- **${wa.term}** vs **${wb.term}** — ${wa.term}: ${wa.definition} / ${wb.term}: ${wb.definition}`);
    }
    lines.push('');
  }

  lines.push('## Quick Reference', '');
  lines.push('| Term | Part of Speech | Definition |', '|---|---|---|');
  for (const set of input.sets) {
    for (const w of set.words) {
      lines.push(`| ${w.term} | ${w.pos ?? ''} | ${w.definition.replace(/\|/g, '\\|')} |`);
    }
  }

  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateStudyGuideHtml(input: StudyGuideInput): string {
  const sections = input.sets
    .map(
      (set) => `
    <section>
      <h2>${escapeHtml(set.name)}</h2>
      ${set.words
        .map(
          (w) => `
        <article class="word">
          <h3>${escapeHtml(w.term)}${w.pos ? ` <span class="pos">(${escapeHtml(w.pos)})</span>` : ''}</h3>
          <p class="def">${escapeHtml(w.definition)}</p>
          ${w.simple ? `<p class="simple">${escapeHtml(w.simple)}</p>` : ''}
          ${w.examples.map((ex) => `<p class="example">"${escapeHtml(ex)}"</p>`).join('')}
          ${w.synonyms.length ? `<p class="meta"><strong>Synonyms:</strong> ${escapeHtml(w.synonyms.join(', '))}</p>` : ''}
          ${w.antonyms.length ? `<p class="meta"><strong>Antonyms:</strong> ${escapeHtml(w.antonyms.join(', '))}</p>` : ''}
          ${w.notes ? `<p class="meta"><strong>Note:</strong> ${escapeHtml(w.notes)}</p>` : ''}
        </article>`,
        )
        .join('')}
    </section>`,
    )
    .join('');

  const confusionSection =
    input.confusionPairs.length > 0
      ? `
    <section>
      <h2>Confusion Pairs</h2>
      <ul>
        ${input.confusionPairs
          .map((pair) => {
            const wa = findWord(input.sets, pair.a);
            const wb = findWord(input.sets, pair.b);
            if (!wa || !wb) return '';
            return `<li><strong>${escapeHtml(wa.term)}</strong> vs <strong>${escapeHtml(wb.term)}</strong> — ${escapeHtml(wa.definition)} / ${escapeHtml(wb.definition)}</li>`;
          })
          .join('')}
      </ul>
    </section>`
      : '';

  const rows = input.sets
    .flatMap((s) => s.words)
    .map(
      (w) =>
        `<tr><td>${escapeHtml(w.term)}</td><td>${escapeHtml(w.pos ?? '')}</td><td>${escapeHtml(w.definition)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Study Guide</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.5; }
  h1 { font-size: 1.8rem; }
  h2 { font-size: 1.3rem; border-bottom: 2px solid #111; padding-bottom: 0.25rem; margin-top: 2rem; break-after: avoid; }
  h3 { font-size: 1.05rem; margin-bottom: 0.2rem; break-inside: avoid; }
  .word { margin-bottom: 1rem; break-inside: avoid; }
  .pos { font-weight: normal; font-style: italic; color: #555; font-size: 0.85em; }
  .def { margin: 0.15rem 0; }
  .simple { color: #444; font-style: italic; margin: 0.15rem 0; }
  .example { margin: 0.15rem 0 0.15rem 1rem; color: #333; }
  .meta { font-size: 0.9em; color: #333; margin: 0.1rem 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #999; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9em; }
  th { background: #eee; }
  @media print {
    body { margin: 0; }
    section { break-inside: avoid-page; }
  }
</style>
</head>
<body>
<h1>Study Guide</h1>
${sections}
${confusionSection}
<section>
  <h2>Quick Reference</h2>
  <table>
    <thead><tr><th>Term</th><th>Part of Speech</th><th>Definition</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>
</body>
</html>`;
}
