import type { DBSchema } from 'idb';
import type { ProgressRecord, SessionRecord, Word } from '@/types/domain';

export const DB_NAME = 'vocab-lab';
/** IndexedDB's own object-store version — bump only when adding/changing
 * stores or indexes. This is separate from the application record
 * `schemaVersion` in src/types/domain.ts, which src/db/migrations.ts
 * handles independently (§5: "Add a migration runner keyed on
 * schemaVersion"). */
export const DB_VERSION = 1;

export interface MetaRecord {
  key: string;
  value: unknown;
}

/**
 * Exactly the four stores from §2, no more:
 *
 * | Store    | Key     | Indexes                                  |
 * |----------|---------|-------------------------------------------|
 * | words    | id      | setId, term, [setId+term]                 |
 * | progress | wordId  | due, box, [setId+due], starred            |
 * | sessions | id      | startedAt, mode                           |
 * | meta     | key     | —                                          |
 *
 * The compound [setId+due] index is what makes "words due today in this
 * set" an index range scan instead of a table walk. Every query in
 * src/db/*.ts is bounded — nothing here ever calls getAll() unbounded.
 */
export interface VocabDB extends DBSchema {
  words: {
    key: string;
    value: Word;
    indexes: {
      setId: string;
      term: string;
      'setId+term': [string, string];
    };
  };
  progress: {
    key: string;
    value: ProgressRecord;
    indexes: {
      due: number;
      box: number;
      'setId+due': [string, number];
      // IndexedDB keys cannot be booleans (spec: string/date/float/binary/
      // array only) — fake-indexeddb enforces this too, real engines do as
      // well. The index is still named "starred" per §2's table; its
      // keyPath actually points at a 0/1 shadow field written alongside
      // the real `starred: boolean` on every progress record. See
      // src/db/progress.ts.
      starred: number;
    };
  };
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: {
      startedAt: number;
      mode: string;
    };
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
}
