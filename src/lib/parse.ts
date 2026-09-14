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
//
// A fourth shape lives under format 1's umbrella rather than as a separate
// numbered format, since it's still fundamentally "headword, then gloss on
// the next line" — it just needs two extra things recognised within that
// gloss line: a `(pos.)` prefix, and a trailing `(example sentence.)`
// instead of a quoted one. This is SparkNotes' own actual vocabulary-list
// export shape (`## term` markdown header, `(pos.) definition (example.)`
// gloss, multiple senses inline as `1. ... 2. ...` on one line) — real
// SAT-list text pasted in comes out this way, not as neat quoted examples.

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
/** A single `#` starts a title/comment line to skip silently (`# Notes`).
 * `##`-or-deeper is a markdown *header* — real content (a headword), not a
 * comment — so it's deliberately excluded here and stripped separately by
 * HEADER_STRIP_RE instead of being swallowed. */
const COMMENT_RE = /^\s*#(?!#)/;
const HEADER_STRIP_RE = /^\s*#{2,}\s*/;
/** A "bare" headword line: just a term/phrase, no separators that would
 * make it a format 1a or format 2 line. */
const BARE_TERM_RE = /^[A-Za-z][A-Za-z' -]*$/;
/** Format 1a: `term<TAB or dash>definition` on one line. */
const INLINE_GLOSS_RE = /^([A-Za-z][A-Za-z' -]*?)\s*(?:\t+|—|--|- )\s*(.+)$/;
/** Format 2: `word (pos) - meaning`. */
const INLINE_POS_RE = /^([A-Za-z][A-Za-z' -]*?)\s*\(([^)]+)\)\s*(?:-|—|:)\s*(.+)$/;
/** Format 3 continuation line: `1. (pos) meaning` or `1. meaning`. */
const NUMBERED_SENSE_RE = /^(\d+)[.)]\s*(?:\(([^)]+)\)\s*)?(.+)$/;
/** A `(pos.)` tag leading a gloss, e.g. `(v.) to humiliate, degrade`. */
const LEADING_POS_RE = /^\(([^)]+)\)\s*/;
/** One trailing `(...)` group, no nested parens — checked against
 * TRAILING_EXAMPLE_SENTENCE_RE below before it's trusted as an example
 * rather than a genuine parenthetical aside in the definition itself. */
const TRAILING_PAREN_RE = /\s*\(([^()]+)\)\s*$/;
const TRAILING_EXAMPLE_SENTENCE_RE = /[.!?]["”]?$/;
/** Detects two-or-more inline numbered senses on a *single* line — the
 * SparkNotes shape (`1. (v.) ... 2. (v.) ...`), as opposed to format 3's
 * one-sense-per-line shape. */
const INLINE_SENSE_MARKER_RE = /(?:^|\s)(\d+)\.\s+/g;

/** Strips a leading `(pos.)` tag off a gloss, if present. */
function extractLeadingPos(text: string): { pos?: string; rest: string } {
  const m = LEADING_POS_RE.exec(text);
  if (m) return { pos: m[1].trim(), rest: text.slice(m[0].length) };
  return { rest: text };
}

/** Peels trailing `(sentence.)` groups off a gloss as examples — the
 * plain-parenthetical convention (as opposed to extractExamples' quoted
 * one). Only peels a group that actually looks like a sentence (ends in
 * sentence punctuation), so a genuine parenthetical aside inside the
 * definition itself — `denounce (v.) to criticize (formally)` — isn't
 * mistaken for an example and swallowed. Never empties the definition
 * entirely: if peeling would do that, the candidate is put back. */
function extractTrailingParenExamples(text: string): { definition: string; examples: string[] } {
  const examples: string[] = [];
  let rest = text.trim();
  for (;;) {
    const m = TRAILING_PAREN_RE.exec(rest);
    if (!m) break;
    const inner = m[1].trim();
    if (!TRAILING_EXAMPLE_SENTENCE_RE.test(inner)) break;
    const before = rest.slice(0, m.index).trim();
    if (!before) break; // would consume the whole gloss — not a real example
    examples.unshift(inner);
    rest = before;
  }
  return { definition: rest, examples };
}

/** Splits a single line carrying multiple inline numbered senses
 * (`1. ... 2. ... 3. ...`, all on one line — SparkNotes' shape) into their
 * raw per-sense text. Returns `[]` when there's fewer than two markers, so
 * callers can tell "not this format" from "one sense, oddly numbered". */
function splitInlineSenses(text: string): string[] {
  const markers = [...text.matchAll(INLINE_SENSE_MARKER_RE)];
  if (markers.length < 2) return [];
  const chunks: string[] = [];
  for (let k = 0; k < markers.length; k++) {
    const start = markers[k].index + markers[k][0].length;
    const end = k + 1 < markers.length ? markers[k + 1].index : text.length;
    chunks.push(text.slice(start, end).trim());
  }
  return chunks;
}

/** Full gloss-line parse for format 1b's "next line" — pos prefix, then
 * trailing-paren examples, then (still) quoted examples, so all three
 * conventions this parser understands compose on the same line. */
function parseGlossChunk(raw: string): { pos?: string; definition: string; examples: string[] } {
  const { pos, rest } = extractLeadingPos(raw);
  const afterParens = extractTrailingParenExamples(rest);
  const afterQuotes = extractExamples(afterParens.definition);
  return { pos, definition: afterQuotes.definition, examples: [...afterParens.examples, ...afterQuotes.examples] };
}

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

    // Format 1a: `term<TAB or dash>definition` on one line. Checked before
    // the bare-headword branch below on purpose: BARE_TERM_RE's character
    // class allows spaces and hyphens (so hyphenated terms like
    // "well-known" can match it as a plain headword), which means a
    // genuine one-line "term - definition" string matches BARE_TERM_RE
    // too — it's just letters/spaces/a hyphen throughout. Without this
    // ordering, a dash-separated line immediately followed by another
    // parseable line got misread as a bare headword whose gloss was that
    // *following* line, silently swallowing it. Format 1a requires an
    // actual separator, so it's the more specific/reliable signal and
    // wins whenever it matches.
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

    // A markdown header (`## term`) is still just a bare headword line
    // underneath — strip the hashes before any of the format-3/1b checks
    // below so a SparkNotes-style `## abase` is recognised the same way a
    // plain `abase` line would be.
    const dehashedLine = line.replace(HEADER_STRIP_RE, '');

    // Format 3/4: bare headword followed by numbered senses.
    if (BARE_TERM_RE.test(dehashedLine.trim())) {
      const next = rawLines[i + 1];
      const nextLooksLikeGloss = next !== undefined && !BLANK_RE.test(next) && !COMMENT_RE.test(next);

      // Format 4: bare headword, then a gloss line carrying two-or-more
      // inline numbered senses (`1. (v.) ... 2. (v.) ...`) — SparkNotes'
      // actual export shape. Checked *before* format 3's one-line-per-sense
      // loop below: NUMBERED_SENSE_RE's `(.+)$` is greedy and would
      // otherwise match this same line as a single garbled "sense 1" whose
      // gloss text still has the literal "2. ..." stuck inside it.
      if (nextLooksLikeGloss) {
        const inlineChunks = splitInlineSenses(next);
        if (inlineChunks.length > 0) {
          const parsed = inlineChunks.map(parseGlossChunk).filter((s) => s.definition);
          if (parsed.length > 0) {
            const [first, ...rest] = parsed;
            words.push({
              id: slugify(dehashedLine),
              term: dehashedLine.trim().toLowerCase(),
              pos: first.pos,
              definition: first.definition,
              examples: first.examples,
              senses: rest.map((s) => ({ pos: s.pos, definition: s.definition, examples: s.examples })),
              sourceLine: lineNo,
            });
            i += 2;
            continue;
          }
        }
      }

      // Format 3: numbered senses, one per line.
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
          id: slugify(dehashedLine),
          term: dehashedLine.trim().toLowerCase(),
          pos: first.pos,
          definition: first.definition,
          examples: first.examples,
          senses: rest,
          sourceLine: lineNo,
        });
        i = j;
        continue;
      }

      // Format 1b: bare headword, gloss on the very next line — also
      // handles a `(pos.)`-prefixed, paren-delimited-example gloss (the
      // single-sense case of format 4's shape), via parseGlossChunk.
      if (nextLooksLikeGloss && !NUMBERED_SENSE_RE.test(next.trim())) {
        const { pos, definition, examples } = parseGlossChunk(next.trim());
        if (definition) {
          words.push({
            id: slugify(dehashedLine),
            term: dehashedLine.trim().toLowerCase(),
            pos,
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

    issues.push({ line: lineNo, raw: line, reason: 'unrecognised format' });
    i++;
  }

  return { words: dedupeById(words), issues };
}
