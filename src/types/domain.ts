// Domain types — mirrors the §5 data schema exactly. `schemaVersion` here
// tracks the *application* record shape (see src/db/migrations.ts), not the
// IndexedDB object-store version (see src/db/schema.ts DB_VERSION).

export const CURRENT_SCHEMA_VERSION = 2;

/** An extra numbered sense on a word — same shape as the word's primary
 * sense, minus recursion. */
export interface WordSense {
  pos?: string;
  definition: string;
  simple?: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  notes?: string;
}

export interface Word {
  /** slug; stable; the join key for progress. */
  id: string;
  setId: string;
  term: string;
  pos?: string;
  definition: string;
  simple?: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  /** extra numbered senses, same shape as the primary one */
  senses: WordSense[];
  /** accepted alternate spellings — old slugs on rename, Write-mode
   * near-miss overrides, parser variant spellings. Progress always joins on
   * `id`, so a slug rename never resets mastery as long as the old id lands
   * here. */
  aliases: string[];
  notes?: string;
  /** hash of term + definition + examples + synonyms — see src/lib/hash.ts.
   * Drives delta re-import (§2) and enrichment caching (§4). */
  contentHash: string;
  updatedAt: number;
  /** device id that last wrote this record — see src/db/meta.ts. */
  origin: string;
  /** tombstone for the future sync merge (§2) — never hard-deleted so a
   * last-write-wins merge can propagate the deletion. */
  deleted?: boolean;
}

/** Escalates recognise → recall → produce as a word climbs its Leitner box
 * (§3 Learn). */
export type QuestionTier = 'recognise' | 'recall' | 'produce';

export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

export interface ProgressRecord {
  /** join key back to Word.id — progress is intentionally a separate store
   * (§2) so re-importing/re-authoring/re-slugging a word never resets it. */
  wordId: string;
  setId: string;
  box: LeitnerBox;
  /** epoch ms this word is next due. */
  due: number;
  tier: QuestionTier;
  right: number;
  wrong: number;
  seen: number;
  lastSeen: number;
  avgMs: number;
  starred: boolean;
  /** which distractor was wrongly chosen, and how often — feeds confusion
   * pairs (§4). */
  missedAgainst: Record<string, number>;
  updatedAt: number;
  origin: string;
  deleted?: boolean;
}

export type StudyMode = 'flashcards' | 'learn' | 'test' | 'match' | 'write';

export interface SessionAnswer {
  wordId: string;
  correct: boolean;
  ms: number;
  givenAnswer?: string;
  tier?: QuestionTier;
}

export interface SessionRecord {
  id: string;
  mode: StudyMode;
  setIds: string[];
  /** mulberry32 seed — stored so a killed/bad session can be replayed
   * exactly (§2 determinism). */
  seed: number;
  /** word ids, bounded to <=20 per session (§2). */
  queue: string[];
  currentIndex: number;
  /** persisted after every answer so killing the tab mid-session and
   * reopening restores exactly where it left off (§2). */
  answers: SessionAnswer[];
  startedAt: number;
  completedAt?: number;
  updatedAt: number;
  origin: string;
}

/** Sets aren't their own object store (§2 lists only words/progress/
 * sessions/meta) — set metadata lives under the `meta` key `sets` (see
 * src/db/meta.ts) and is derived/kept in sync as words are imported. */
export interface SetInfo {
  id: string;
  name: string;
  updatedAt: number;
  origin: string;
  deleted?: boolean;
}

// ---- Seed / import file shape (data/words.seed.json, §5/§6) ----

export interface RawSeedWord {
  id: string;
  term: string;
  pos?: string;
  definition: string;
  simple?: string;
  examples?: string[];
  synonyms?: string[];
  antonyms?: string[];
  senses?: WordSense[];
  aliases?: string[];
  notes?: string;
}

export interface RawSeedSet {
  id: string;
  name: string;
  words: RawSeedWord[];
}

export interface WordSeedFile {
  schemaVersion: number;
  sets: RawSeedSet[];
}
