# Vocab Lab

A personal vocabulary practice app — offline-first, no backend, built to
scale to 25,000 words across 100 sets without touching component code to
add a batch. See the original build brief for full requirements; this file
tracks what's actually implemented.

## Stack

React + TypeScript + Vite · idb (IndexedDB) · a single Web Worker for
import/search/stats · Zustand for ephemeral session state · Tailwind for
layout only, hand-written neobrutalist tokens for everything visual ·
Vitest for the scheduler/parser/merge/delta-import suites.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest run
npm run bench    # scripts/bench.mjs — 25k-word synthetic performance bench
```

## Importing a raw word list

```bash
node scripts/import-list.mjs data/raw/sat-1000.txt "SAT Core" > data/sat-core.json
```

Unparseable lines are written to stderr as `REVIEW` rather than dropped.

## Architecture notes

- **Storage**: `src/db/` — four IndexedDB stores (`words`, `progress`,
  `sessions`, `meta`) via `idb`, migration runner keyed on `schemaVersion`.
- **Worker**: `src/worker/protocol.ts` is the one typed message contract
  the UI thread and worker speak over — import parsing, search-index
  build, and stats aggregation all happen off the main thread.
- **Parser**: `src/lib/parse.ts` is the single implementation shared by
  the CLI (`scripts/import-list.mjs`), the worker, and the in-app Import
  screen.
- **Scheduler**: `src/lib/scheduler.ts` — pure, five-box Leitner engine.
- **Merge**: `src/lib/merge.ts` — last-write-wins on `updatedAt`, ready for
  a future sync backend without a schema change.

## Build log

Milestones follow §10 of the build brief; each is a separate commit.
