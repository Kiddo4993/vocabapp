#!/usr/bin/env node
// CLI wrapper around src/lib/parse.ts — the same parser the worker and the
// in-app Import screen use (§6: "three call sites, one implementation").
//
// Usage:
//   node scripts/import-list.mjs data/raw/sat-1000.txt "SAT Core" > data/sat-core.json
//
// Runs under plain `node` — no build step, no ts-node — via Node 22's
// native TypeScript type-stripping. That's also why parse.ts has zero
// dependencies of its own and is imported here with an explicit `.ts`
// extension: Node's ESM resolver (unlike Vite's) doesn't guess extensions.
import { readFileSync } from 'node:fs';
import { slugify, parseWordList } from '../src/lib/parse.ts';

const [, , inputPath, setName] = process.argv;

if (!inputPath || !setName) {
  console.error('Usage: node scripts/import-list.mjs <input.txt> "<Set Name>" > out.json');
  process.exit(1);
}

let text;
try {
  text = readFileSync(inputPath, 'utf-8');
} catch (err) {
  console.error(`Could not read ${inputPath}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const { words, issues } = parseWordList(text);

for (const issue of issues) {
  console.error(`REVIEW (line ${issue.line}): ${issue.raw}`);
}

const seedFile = {
  schemaVersion: 2,
  sets: [
    {
      id: slugify(setName),
      name: setName,
      words: words.map((w) => ({
        id: w.id,
        term: w.term,
        ...(w.pos ? { pos: w.pos } : {}),
        definition: w.definition,
        examples: w.examples,
        synonyms: [],
        antonyms: [],
        senses: w.senses.map((s) => ({
          ...(s.pos ? { pos: s.pos } : {}),
          definition: s.definition,
          examples: s.examples,
          synonyms: [],
          antonyms: [],
        })),
        aliases: [],
      })),
    },
  ],
};

process.stdout.write(JSON.stringify(seedFile, null, 2) + '\n');

console.error(
  `\nParsed ${words.length} word(s), ${issues.length} line(s) sent to REVIEW, from ${inputPath}.`,
);
