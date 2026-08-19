import { describe, expect, it } from 'vitest';
import { mergeCollections, mergeRecord, type Mergeable } from './merge';

// A hand-written conflict fixture (§2: "unit-test the merge function now
// against a hand-written conflict fixture"), modelling a Word-shaped
// record edited on two different devices while offline.
interface FixtureRecord extends Mergeable {
  id: string;
  term: string;
  definition: string;
}

const BASE: FixtureRecord = {
  id: 'arch',
  term: 'arch',
  definition: 'Deliberately teasing in a knowing, playful way.',
  updatedAt: 1_000,
  origin: 'device-a',
};

describe('mergeRecord — last-write-wins on updatedAt', () => {
  it('picks whichever side has the greater updatedAt, regardless of argument order', () => {
    const older: FixtureRecord = { ...BASE, updatedAt: 1_000, definition: 'Old definition.' };
    const newer: FixtureRecord = { ...BASE, updatedAt: 2_000, definition: 'New definition.', origin: 'device-b' };

    expect(mergeRecord(older, newer)).toBe(newer);
    expect(mergeRecord(newer, older)).toBe(newer);
  });

  it('is deterministic when both sides are identical (equal updatedAt and origin)', () => {
    const a = { ...BASE };
    const b = { ...BASE };
    // Equal updatedAt falls to the origin tie-break; equal origins means
    // `a.origin >= b.origin` is true, so `a` wins — but either result
    // would be content-identical here, which is the actual invariant.
    expect(mergeRecord(a, b)).toEqual(a);
    expect(mergeRecord(a, b)).toEqual(b);
  });
});

describe('mergeRecord — conflicting edits from two origins', () => {
  it('resolves a real conflict (same record, two devices, different fields changed) to the newer edit', () => {
    // device-a edits the definition at t=1000; device-b independently
    // edits the same word's notes at t=1500, unaware of device-a's edit.
    const fromDeviceA: FixtureRecord = {
      ...BASE,
      definition: 'Edited on device A.',
      updatedAt: 1_000,
      origin: 'device-a',
    };
    const fromDeviceB: FixtureRecord = {
      ...BASE,
      definition: 'Edited on device B.',
      updatedAt: 1_500,
      origin: 'device-b',
    };

    const merged = mergeRecord(fromDeviceA, fromDeviceB);
    expect(merged.definition).toBe('Edited on device B.');
    expect(merged.origin).toBe('device-b');
  });

  it('breaks an exact updatedAt tie deterministically by origin, independent of argument order', () => {
    const a: FixtureRecord = { ...BASE, definition: 'From A.', updatedAt: 5_000, origin: 'device-a' };
    const b: FixtureRecord = { ...BASE, definition: 'From B.', updatedAt: 5_000, origin: 'device-b' };

    // 'device-b' > 'device-a' lexicographically, so B should win both ways.
    expect(mergeRecord(a, b).origin).toBe('device-b');
    expect(mergeRecord(b, a).origin).toBe('device-b');
  });
});

describe('mergeRecord — deletion tombstones', () => {
  it('a delete newer than an edit wins — the record stays deleted', () => {
    const edited: FixtureRecord = { ...BASE, definition: 'Still here.', updatedAt: 1_000, origin: 'device-a' };
    const deleted: FixtureRecord = { ...BASE, deleted: true, updatedAt: 2_000, origin: 'device-b' };

    const merged = mergeRecord(edited, deleted);
    expect(merged.deleted).toBe(true);
  });

  it('an edit newer than a delete "undeletes" the record', () => {
    const deleted: FixtureRecord = { ...BASE, deleted: true, updatedAt: 1_000, origin: 'device-a' };
    const revived: FixtureRecord = { ...BASE, definition: 'Brought back.', updatedAt: 2_000, origin: 'device-b' };

    const merged = mergeRecord(deleted, revived);
    expect(merged.deleted).toBeUndefined();
    expect(merged.definition).toBe('Brought back.');
  });

  it('a tombstone is never discarded outright — it only loses when genuinely older', () => {
    const deletedOlder: FixtureRecord = { ...BASE, deleted: true, updatedAt: 500, origin: 'device-a' };
    const editedNewer: FixtureRecord = { ...BASE, updatedAt: 1_000, origin: 'device-b' };
    expect(mergeRecord(deletedOlder, editedNewer).deleted).toBeUndefined();

    const deletedNewer: FixtureRecord = { ...BASE, deleted: true, updatedAt: 1_500, origin: 'device-a' };
    expect(mergeRecord(editedNewer, deletedNewer).deleted).toBe(true);
  });
});

describe('mergeCollections', () => {
  it('merges per-key with last-write-wins, and passes through keys unique to one side', () => {
    const local: Record<string, FixtureRecord> = {
      arch: { ...BASE, definition: 'Local arch.', updatedAt: 1_000, origin: 'device-a' },
      onlyLocal: { ...BASE, id: 'onlyLocal', term: 'onlyLocal', updatedAt: 1_000, origin: 'device-a' },
    };
    const remote: Record<string, FixtureRecord> = {
      arch: { ...BASE, definition: 'Remote arch.', updatedAt: 2_000, origin: 'device-b' },
      onlyRemote: { ...BASE, id: 'onlyRemote', term: 'onlyRemote', updatedAt: 1_000, origin: 'device-b' },
    };

    const merged = mergeCollections(local, remote);
    expect(Object.keys(merged).sort()).toEqual(['arch', 'onlyLocal', 'onlyRemote']);
    expect(merged.arch.definition).toBe('Remote arch.');
    expect(merged.onlyLocal).toBe(local.onlyLocal);
    expect(merged.onlyRemote).toBe(remote.onlyRemote);
  });

  it('is commutative — merging A into B gives the same result as B into A', () => {
    const local: Record<string, FixtureRecord> = {
      arch: { ...BASE, definition: 'Local.', updatedAt: 1_000, origin: 'device-a' },
    };
    const remote: Record<string, FixtureRecord> = {
      arch: { ...BASE, definition: 'Remote.', updatedAt: 1_000, origin: 'device-z' },
    };
    expect(mergeCollections(local, remote)).toEqual(mergeCollections(remote, local));
  });
});
