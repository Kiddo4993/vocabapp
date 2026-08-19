// Backup (§4/§10.9): one-click export of the whole database to a JSON
// file, and import-merge back through the §2 merge function. DB
// orchestration lives here; the actual conflict resolution is
// src/lib/merge.ts, already unit-tested against a hand-written fixture
// independent of this feature ever existing.

import { CURRENT_SCHEMA_VERSION } from '@/types/domain';
import { getSets, upsertSet } from '@/db/meta';
import { getAllProgress, putProgressBatch } from '@/db/progress';
import { getAllSessions, putSession } from '@/db/sessions';
import { getAllWordsForIndexing, putWordsBatch } from '@/db/words';
import { mergeCollections } from '@/lib/merge';
import type { ProgressRecord, SessionRecord, SetInfo, Word } from '@/types/domain';

export interface BackupFile {
  schemaVersion: number;
  exportedAt: number;
  words: Word[];
  progress: ProgressRecord[];
  sessions: SessionRecord[];
  sets: SetInfo[];
}

function byKey<T>(items: T[], keyOf: (item: T) => string): Record<string, T> {
  return Object.fromEntries(items.map((item) => [keyOf(item), item]));
}

/** Reads every store in one pass. Deliberately not going through the
 * bounded-cursor helpers elsewhere in src/db — a full backup export is
 * the one place "read literally everything" is the actual, correct
 * behaviour, not a bug to route around. */
export async function exportBackup(): Promise<BackupFile> {
  const [words, progress, sessions, sets] = await Promise.all([
    getAllWordsForIndexing(),
    getAllProgress(),
    getAllSessions(),
    getSets(),
  ]);
  return { schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: Date.now(), words, progress, sessions, sets };
}

export interface ImportMergeResult {
  wordsWritten: number;
  progressWritten: number;
  sessionsWritten: number;
  setsWritten: number;
}

/** Merges an imported backup into the current database via last-write-
 * wins on updatedAt (src/lib/merge.ts), writing back only the records
 * that actually changed as a result. Safe to run against your own
 * current export (a no-op) or a backup from another device. */
export async function importMergeBackup(file: BackupFile): Promise<ImportMergeResult> {
  const [currentWords, currentProgress, currentSessions, currentSets] = await Promise.all([
    getAllWordsForIndexing(),
    getAllProgress(),
    getAllSessions(),
    getSets(),
  ]);

  const currentWordsById = byKey(currentWords, (w) => w.id);
  const mergedWords = mergeCollections(currentWordsById, byKey(file.words, (w) => w.id));
  const changedWords = Object.entries(mergedWords)
    .filter(([id, w]) => currentWordsById[id] !== w)
    .map(([, w]) => w);
  if (changedWords.length > 0) await putWordsBatch(changedWords);

  const currentProgressById = byKey(currentProgress, (p) => p.wordId);
  const mergedProgress = mergeCollections(currentProgressById, byKey(file.progress, (p) => p.wordId));
  const changedProgress = Object.entries(mergedProgress)
    .filter(([id, p]) => currentProgressById[id] !== p)
    .map(([, p]) => p);
  if (changedProgress.length > 0) await putProgressBatch(changedProgress);

  const currentSessionsById = byKey(currentSessions, (s) => s.id);
  const mergedSessions = mergeCollections(currentSessionsById, byKey(file.sessions, (s) => s.id));
  const changedSessions = Object.entries(mergedSessions)
    .filter(([id, s]) => currentSessionsById[id] !== s)
    .map(([, s]) => s);
  for (const s of changedSessions) await putSession(s);

  const currentSetsById = byKey(currentSets, (s) => s.id);
  const mergedSets = mergeCollections(currentSetsById, byKey(file.sets, (s) => s.id));
  const changedSets = Object.entries(mergedSets)
    .filter(([id, s]) => currentSetsById[id] !== s)
    .map(([, s]) => s);
  for (const s of changedSets) await upsertSet(s);

  return {
    wordsWritten: changedWords.length,
    progressWritten: changedProgress.length,
    sessionsWritten: changedSessions.length,
    setsWritten: changedSets.length,
  };
}

