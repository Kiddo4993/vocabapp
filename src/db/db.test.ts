// @vitest-environment node
//
// jsdom (the project default, see vitest.config.ts) ships its own inert
// `indexedDB` stub that fake-indexeddb/auto can't fully override, which
// hangs every request. IndexedDB-touching suites need the plain `node`
// environment instead so fake-indexeddb/auto is the only implementation in
// play.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests, getDB } from './client';
import { getSets } from './meta';
import { getDueCount, getDueWordIds } from './progress';
import { loadSeedIfNeeded } from './seed';
import { countWordsInSet, getWordsBySetPage } from './words';

const SEED_PATH = resolve(process.cwd(), 'data/words.seed.json');

function fakeFetch(): typeof fetch {
  return (async () => {
    const text = readFileSync(SEED_PATH, 'utf-8');
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => JSON.parse(text),
    } as Response;
  }) as typeof fetch;
}

beforeEach(async () => {
  // fake-indexeddb persists across tests in the same module registry, and
  // deleteDatabase() blocks forever while a connection is still open — so
  // close out the previous test's connection before deleting.
  await _resetDBForTests();
  await new Promise<void>((res, rej) => {
    const req = indexedDB.deleteDatabase('vocab-lab');
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
    req.onblocked = () => res();
  });
});

describe('schema + migration runner', () => {
  it('creates all four object stores with their indexes', async () => {
    const db = await getDB();
    expect([...db.objectStoreNames].sort()).toEqual(['meta', 'progress', 'sessions', 'words']);

    const wordsTx = db.transaction('words', 'readonly');
    expect([...wordsTx.store.indexNames].sort()).toEqual(['setId', 'setId+term', 'term']);
    await wordsTx.done;

    const progressTx = db.transaction('progress', 'readonly');
    expect([...progressTx.store.indexNames].sort()).toEqual(['box', 'due', 'setId+due', 'starred']);
    await progressTx.done;

    const sessionsTx = db.transaction('sessions', 'readonly');
    expect([...sessionsTx.store.indexNames].sort()).toEqual(['mode', 'startedAt']);
    await sessionsTx.done;
  });

  it('stamps schemaVersion 2 on a fresh database (mechanism exercised, §5)', async () => {
    const db = await getDB();
    const record = await db.get('meta', 'schemaVersion');
    expect(record?.value).toBe(2);
  });
});

describe('seed load', () => {
  it('loads 29 words across 7 sets from data/words.seed.json', async () => {
    const result = await loadSeedIfNeeded(fakeFetch());
    expect(result.loaded).toBe(true);
    expect(result.wordCount).toBe(29);

    const sets = await getSets();
    expect(sets).toHaveLength(7);

    const toneSet = await countWordsInSet('tone-and-manner');
    expect(toneSet).toBe(6);
    const scienceSet = await countWordsInSet('science-and-anatomy');
    expect(scienceSet).toBe(9);
  });

  it('is a no-op on a second call (idempotent)', async () => {
    await loadSeedIfNeeded(fakeFetch());
    const second = await loadSeedIfNeeded(fakeFetch());
    expect(second.loaded).toBe(false);
    expect(second.wordCount).toBe(0);
  });

  it('gives every seeded word a contentHash and an initial box-1 progress record', async () => {
    await loadSeedIfNeeded(fakeFetch());
    const page = await getWordsBySetPage('yield-family');
    expect(page.items).toHaveLength(2);
    for (const w of page.items) {
      expect(w.contentHash).toMatch(/^[0-9a-f]{16}$/);
    }

    const now = Date.now() + 1000;
    const dueCount = await getDueCount('yield-family', now);
    expect(dueCount).toBe(2);
    const dueIds = await getDueWordIds('yield-family', now);
    expect(dueIds.sort()).toEqual(['unyielding', 'yield']);
  });

  it('seeds the §6 confusion pairs into missedAgainst bidirectionally', async () => {
    await loadSeedIfNeeded(fakeFetch());
    const db = await getDB();
    const pairs: [string, string][] = [
      ['corroborate', 'corrode'],
      ['concentric', 'eccentric'],
      ['hydrodynamic', 'aerodynamic'],
      ['agonist', 'antagonist'],
      ['yield', 'unyielding'],
      ['writhing', 'squirming'],
      ['arch', 'flippant'],
    ];
    for (const [a, b] of pairs) {
      const pa = await db.get('progress', a);
      const pb = await db.get('progress', b);
      expect(pa?.missedAgainst[b]).toBe(1);
      expect(pb?.missedAgainst[a]).toBe(1);
    }
  });

  it('never resets an existing progress record when seeding again after a wipe of just the loaded flag', async () => {
    await loadSeedIfNeeded(fakeFetch());
    const db = await getDB();
    // Simulate answering a word correctly a few times.
    const progress = await db.get('progress', 'arch');
    expect(progress).toBeDefined();
    await db.put('progress', { ...progress!, box: 3, right: 5 });

    // Force the loader to run again (as if seedLoaded were wiped).
    await db.delete('meta', 'seedLoaded');
    await loadSeedIfNeeded(fakeFetch());

    const after = await db.get('progress', 'arch');
    expect(after?.box).toBe(3);
    expect(after?.right).toBe(5);
  });
});
