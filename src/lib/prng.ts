// mulberry32 — the one seeded PRNG all shuffling in the app goes through
// (§2 determinism). Seeded per session and the seed is stored on the
// session record, so a bad session can be replayed exactly.

export type RNG = () => number;

/** Returns a deterministic RNG function producing floats in [0, 1). */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle driven by a supplied RNG — pass a mulberry32(seed)
 * instance so the shuffle is reproducible. Does not mutate the input. */
export function shuffle<T>(items: readonly T[], rng: RNG): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Derives a session seed from a time component plus a bit of entropy. Kept
 * as a small helper so every call site seeds sessions the same way. */
export function makeSessionSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
