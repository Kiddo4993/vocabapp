import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type VocabDB } from './schema';
import { runMigrations } from './migrations';

let dbPromise: Promise<IDBPDatabase<VocabDB>> | null = null;

function createStores(db: IDBPDatabase<VocabDB>) {
  if (!db.objectStoreNames.contains('words')) {
    const words = db.createObjectStore('words', { keyPath: 'id' });
    words.createIndex('setId', 'setId');
    words.createIndex('term', 'term');
    words.createIndex('setId+term', ['setId', 'term']);
  }

  if (!db.objectStoreNames.contains('progress')) {
    const progress = db.createObjectStore('progress', { keyPath: 'wordId' });
    progress.createIndex('due', 'due');
    progress.createIndex('box', 'box');
    progress.createIndex('setId+due', ['setId', 'due']);
    // keyPath is the numeric shadow field, not the boolean `starred` field
    // itself — see the comment on VocabDB['progress']['indexes']['starred'].
    progress.createIndex('starred', 'starredFlag');
  }

  if (!db.objectStoreNames.contains('sessions')) {
    const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('startedAt', 'startedAt');
    sessions.createIndex('mode', 'mode');
  }

  if (!db.objectStoreNames.contains('meta')) {
    db.createObjectStore('meta', { keyPath: 'key' });
  }
}

/** Opens (or returns the cached handle to) the one IndexedDB database, and
 * runs the application-level schemaVersion migration chain (§5) on first
 * open. Safe to call from anywhere — the main thread, the worker (module
 * workers can use idb the same way), or tests. */
export function getDB(): Promise<IDBPDatabase<VocabDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VocabDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        createStores(db);
      },
    }).then(async (db) => {
      await runMigrations(db);
      return db;
    });
  }
  return dbPromise;
}

/** Test-only escape hatch: closes the current connection (if any) and
 * forces the next getDB() to re-open. IndexedDB's deleteDatabase() blocks
 * forever waiting for open connections to close, so tests that delete the
 * database between cases must await this first. */
export async function _resetDBForTests() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = null;
}
