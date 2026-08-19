// @vitest-environment node
//
// Same reasoning as src/db/db.test.ts: jsdom's inert indexedDB stub hangs
// fake-indexeddb, so IndexedDB-touching suites need the plain node env.
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests, getDB } from '@/db/client';
import { getProgress } from '@/db/progress';
import { getWord } from '@/db/words';
import { handleImport } from './importWorker';
import type { ImportStartPayload, WorkerResponse } from './protocol';

const ORIGIN = 'device-test';

async function runImport(payload: ImportStartPayload): Promise<WorkerResponse & { type: 'import:done' }> {
  let done: (WorkerResponse & { type: 'import:done' }) | undefined;
  for await (const response of handleImport('req-1', payload)) {
    if (response.type === 'import:done') done = response;
  }
  if (!done) throw new Error('handleImport never yielded import:done');
  return done;
}

beforeEach(async () => {
  await _resetDBForTests();
  await new Promise<void>((res, rej) => {
    const req = indexedDB.deleteDatabase('vocab-lab');
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
    req.onblocked = () => res();
  });
});

const SAMPLE_TEXT = ['ethereal\tso delicate it seems otherworldly', 'fester - to rot or become infected'].join('\n');

describe('delta import (§9)', () => {
  it('writes a record for every genuinely new word and creates its progress', async () => {
    const result = await runImport({ jobId: 'job-1', setId: 'test-set', setName: 'Test Set', text: SAMPLE_TEXT, origin: ORIGIN });
    expect(result.payload.written).toBe(2);
    expect(result.payload.skipped).toBe(0);

    const word = await getWord('ethereal');
    expect(word?.definition).toBe('so delicate it seems otherworldly');
    const progress = await getProgress('ethereal');
    expect(progress).toBeDefined();
    expect(progress?.box).toBe(1);
  });

  it('re-importing an unchanged file writes zero records', async () => {
    await runImport({ jobId: 'job-2', setId: 'test-set', setName: 'Test Set', text: SAMPLE_TEXT, origin: ORIGIN });
    const second = await runImport({ jobId: 'job-2b', setId: 'test-set', setName: 'Test Set', text: SAMPLE_TEXT, origin: ORIGIN });
    expect(second.payload.written).toBe(0);
    expect(second.payload.skipped).toBe(2);
  });

  it('changing one definition writes exactly one record', async () => {
    await runImport({ jobId: 'job-3', setId: 'test-set', setName: 'Test Set', text: SAMPLE_TEXT, origin: ORIGIN });

    const changedText = [
      'ethereal\tso delicate it seems otherworldly and dreamlike', // changed
      'fester - to rot or become infected', // unchanged
    ].join('\n');
    const result = await runImport({ jobId: 'job-3b', setId: 'test-set', setName: 'Test Set', text: changedText, origin: ORIGIN });

    expect(result.payload.written).toBe(1);
    expect(result.payload.skipped).toBe(1);
    const word = await getWord('ethereal');
    expect(word?.definition).toBe('so delicate it seems otherworldly and dreamlike');
  });

  it('never resets an existing progress record when re-importing changed content', async () => {
    await runImport({ jobId: 'job-4', setId: 'test-set', setName: 'Test Set', text: SAMPLE_TEXT, origin: ORIGIN });
    const db = await getDB();
    const before = await db.get('progress', 'ethereal');
    await db.put('progress', { ...before!, box: 4, right: 9 });

    const changedText = 'ethereal\tso delicate it seems otherworldly, truly';
    await runImport({ jobId: 'job-4b', setId: 'test-set', setName: 'Test Set', text: changedText, origin: ORIGIN });

    const after = await db.get('progress', 'ethereal');
    expect(after?.box).toBe(4);
    expect(after?.right).toBe(9);
  });

  it('routes unparseable lines to reviewLines without dropping the parseable ones', async () => {
    const text = [SAMPLE_TEXT, '???garbage???'].join('\n');
    const result = await runImport({ jobId: 'job-5', setId: 'test-set', setName: 'Test Set', text, origin: ORIGIN });
    expect(result.payload.written).toBe(2);
    expect(result.payload.reviewLines).toBe(1);
  });

  it('records the set via upsertSet so a fresh import shows up on the home screen', async () => {
    await runImport({ jobId: 'job-6', setId: 'brand-new-set', setName: 'Brand New Set', text: SAMPLE_TEXT, origin: ORIGIN });
    const db = await getDB();
    const sets = (await db.get('meta', 'sets'))?.value as { id: string; name: string }[];
    expect(sets.find((s) => s.id === 'brand-new-set')?.name).toBe('Brand New Set');
  });
});
