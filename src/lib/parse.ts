// The one parser implementation (§6): scripts/import-list.mjs (the CLI),
// src/worker/importWorker.ts (in-app import), and the in-app Import screen
// all import this module — three call sites, one implementation.
//
// Deliberately framework- and DB-free (no IndexedDB, no Word/contentHash
// concerns — those get layered on by each call site) so it stays trivially
// unit-testable and, importantly, runnable by plain `node` with zero
// bundler: Node 22's native TypeScript support strips types from .ts files
// without a build step, but it still resolves relative *value* imports the
// same way plain ESM does — extension required, no path aliases. This file
// has no imports at all, for exactly that reason: don't make the CLI path
// fragile over an import extension.
//
// Handles three input formats (§6):
//   1. headword-then-gloss (Quizlet/SparkNotes export) — either
//      `term<TAB or dash>definition` on one line, or `term` alone on one
//      line with its gloss on the next.
//   2. inline `word (pos) - meaning`.
//   3. numbered multi-sense glosses — a bare headword line followed by
//      `1. ...`, `2. ...` lines.
// Anything else becomes a REVIEW issue instead of being silently dropped.

export interface ParsedSense {
  pos?: string;
  definition: string;
  examples: string[];
}

export interface ParsedWord {
  id: string;
  term: string;
  pos?: string;
  definition: string;
  examples: string[];
  /** Additional numbered senses beyond the primary one above (format 3). */
  senses: ParsedSense[];
  /** 1-based line number the entry started on — useful for tracing a
   * parsed word back to its source line, same spirit as REVIEW's line
   * numbers. */
  sourceLine: number;
}

export interface ParseIssue {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  words: ParsedWord[];
  issues: ParseIssue[];
}

export function slugify(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const QUOTE_RE = /["“]([^"”]+)["”]/g;

/** Pulls trailing/embedded quoted sentences out of a gloss as examples,
 * returning the remaining definition text with them removed and tidied. */
export function extractExamples(text: string): { definition: string; examples: string[] } {
  const examples: string[] = [];
  let definition = text.replace(QUOTE_RE, (_match, inner: string) => {
    examples.push(inner.trim());
    return ' ';
  });
  definition = definition
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()
    .replace(/^[.,;:\s-]+|[.,;:\s-]+$/g, '');
  return { definition, examples };
}

const BLANK_RE = /^\s*$/;
const COMMENT_RE = /^\s*#/;
/** A "bare" headword line: just a term/phrase, no separators that would
 * make it a format 1a or format 2 line. */
const BARE_TERM_RE = /^[A-Za-z][A-Za-z' -]*$/;
/** Format 1a: `term<TAB or dash>definition` on one line. */
const INLINE_GLOSS_RE = /^([A-Za-z][A-Za-z' -]*?)\s*(?:\t+|—|--|- )\s*(.+)$/;
/** Format 2: `word (pos) - meaning`. */
const INLINE_POS_RE = /^([A-Za-z][A-Za-z' -]*?)\s*\(([^)]+)\)\s*(?:-|—|:)\s*(.+)$/;
/** Format 3 continuation line: `1. (pos) meaning` or `1. meaning`. */
const NUMBERED_SENSE_RE = /^(\d+)[.)]\s*(?:\(([^)]+)\)\s*)?(.+)$/;

function richness(w: ParsedWord): number {
  return (
    w.definition.length +
    w.examples.length * 50 +
    w.senses.length * 100 +
    (w.pos ? 10 : 0)
  );
}

/** Dedupes by id, keeping whichever entry scores richer (§9: "dedupe-by-id
 * keeping the richer entry"). Stable on ties — first-seen wins. */
export function dedupeById(words: ParsedWord[]): ParsedWord[] {
  const byId = new Map<string, ParsedWord>();
  for (const w of words) {
    const existing = byId.get(w.id);
    if (!existing || richness(w) > richness(existing)) {
      byId.set(w.id, w);
    }
  }
  return [...byId.values()];
}

export function parseWordList(text: string): ParseResult {
  const rawLines = text.split(/\r\n|\r|\n/);
  const words: ParsedWord[] = [];
  const issues: ParseIssue[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const lineNo = i + 1;
    const line = rawLines[i];

    if (BLANK_RE.test(line) || COMMENT_RE.test(line)) {
      i++;
      continue;
    }

    // Format 2: inline `word (pos) - meaning` — checked first since it's
    // the most specific pattern (parens are a strong signal).
    const posMatch = INLINE_POS_RE.exec(line);
    if (posMatch) {
      const [, term, pos, gloss] = posMatch;
      const { definition, examples } = extractExamples(gloss);
      if (definition) {
        words.push({
          id: slugify(term),
          term: term.trim().toLowerCase(),
          pos: pos.trim(),
          definition,
          examples,
          senses: [],
          sourceLine: lineNo,
        });
        i++;
        continue;
      }
    }

    // Format 3: bare headword followed by numbered senses.
    if (BARE_TERM_RE.test(line.trim())) {
      const senses: ParsedSense[] = [];
      let j = i + 1;
      while (j < rawLines.length) {
        const senseMatch = NUMBERED_SENSE_RE.exec(rawLines[j]);
        if (!senseMatch) break;
        const [, , sensePos, senseGloss] = senseMatch;
        const { definition, examples } = extractExamples(senseGloss);
        if (definition) senses.push({ pos: sensePos?.trim(), definition, examples });
        j++;
      }
      if (senses.length > 0) {
        const [first, ...rest] = senses;
        words.push({
          id: slugify(line),
          term: line.trim().toLowerCase(),
          pos: first.pos,
          definition: first.definition,
          examples: first.examples,
          senses: rest,
          sourceLine: lineNo,
        });
        i = j;
        continue;
      }

      // Format 1b: bare headword, gloss on the very next line.
      const next = rawLines[i + 1];
      if (
        next !== undefined &&
        !BLANK_RE.test(next) &&
        !COMMENT_RE.test(next) &&
        !NUMBERED_SENSE_RE.test(next.trim())
      ) {
        const { definition, examples } = extractExamples(next.trim());
        if (definition) {
          words.push({
            id: slugify(line),
            term: line.trim().toLowerCase(),
            definition,
            examples,
            senses: [],
            sourceLine: lineNo,
          });
          i += 2;
          continue;
        }
      }
    }

    // Format 1a: `term<TAB or dash>definition` on one line.
    const inlineMatch = INLINE_GLOSS_RE.exec(line);
    if (inlineMatch) {
      const [, term, gloss] = inlineMatch;
      const { definition, examples } = extractExamples(gloss);
      if (definition) {
        words.push({
          id: slugify(term),
          term: term.trim().toLowerCase(),
          definition,
          examples,
          senses: [],
          sourceLine: lineNo,
        });
        i++;
        continue;
      }
    }

    issues.push({ line: lineNo, raw: line, reason: 'unrecognised format' });
    i++;
  }

  return { words: dedupeById(words), issues };
}
