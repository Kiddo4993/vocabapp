import type { IDBPDatabase } from 'idb';
import { CURRENT_SCHEMA_VERSION } from '@/types/domain';
import type { VocabDB } from './schema';

const SCHEMA_VERSION_KEY = 'schemaVersion';

export interface Migration {
  from: number;
  to: number;
  /** Mutates records already in the DB to match the `to` shape. Runs inside
   * no particular transaction guarantee beyond "before the app reads
   * anything" — keep migrations idempotent and cheap. */
  run: (db: IDBPDatabase<VocabDB>) => Promise<void>;
}

/**
 * Migration chain keyed on the application-level `schemaVersion` (§5),
 * independent of IndexedDB's own object-store version (see DB_VERSION in
 * schema.ts). Ordered oldest → newest; runMigrations walks forward from
 * whatever version is currently stored.
 *
 * The brief asks for a no-op v2→v2 migration to be wired in from day one so
 * the *mechanism* — reading the stored version, finding applicable
 * migrations, running them in order, persisting the new version — is
 * exercised even though there's nothing to actually migrate yet. When a
 * real v2→v3 change eventually happens, it's a new entry appended to this
 * array, not a rewrite of the runner.
 */
export const MIGRATIONS: Migration[] = [
  {
    from: 2,
    to: 2,
    // No-op: nothing has changed shape since v2. Exists purely so the
    // runner has at least one migration to find and apply on a fresh v2 DB.
    run: async () => {},
  },
];

async function getStoredSchemaVersion(db: IDBPDatabase<VocabDB>): Promise<number | undefined> {
  const record = await db.get('meta', SCHEMA_VERSION_KEY);
  return record?.value as number | undefined;
}

async function setStoredSchemaVersion(db: IDBPDatabase<VocabDB>, version: number): Promise<void> {
  await db.put('meta', { key: SCHEMA_VERSION_KEY, value: version });
}

/** Runs every migration whose `from` is >= the currently stored version,
 * in order, then records CURRENT_SCHEMA_VERSION. On a brand-new database
 * (no stored version yet) this seeds the version to CURRENT_SCHEMA_VERSION
 * directly — there's nothing to migrate, only to stamp. */
export async function runMigrations(db: IDBPDatabase<VocabDB>): Promise<void> {
  const stored = await getStoredSchemaVersion(db);

  if (stored === undefined) {
    await setStoredSchemaVersion(db, CURRENT_SCHEMA_VERSION);
    return;
  }

  if (stored >= CURRENT_SCHEMA_VERSION) return;

  let version = stored;
  for (const migration of MIGRATIONS) {
    if (migration.from < version) continue;
    if (migration.from > CURRENT_SCHEMA_VERSION) break;
    await migration.run(db);
    version = migration.to;
  }

  await setStoredSchemaVersion(db, Math.max(version, CURRENT_SCHEMA_VERSION));
}
