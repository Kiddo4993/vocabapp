// Confusion pairs (§4): computed from missedAgainst (real mistakes, plus
// the §6 seeded pairs baked in at import time) and orthographic
// near-neighbours (edit distance <= 2 on the term). Pure and DB-free —
// callers pass in the words/progress for whichever scope they care about
// (typically one set, so the O(n^2) near-neighbour scan stays cheap).

import { levenshtein } from './levenshtein';
import type { ProgressRecord, Word } from '@/types/domain';

export type ConfusionSource = 'missed' | 'orthographic' | 'both';

export interface ConfusionPair {
  a: string;
  b: string;
  source: ConfusionSource;
  missedCount: number;
  editDistance?: number;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function computeConfusionPairs(words: Word[], progress: ProgressRecord[]): ConfusionPair[] {
  const validIds = new Set(words.map((w) => w.id));
  const pairs = new Map<string, ConfusionPair>();

  for (const p of progress) {
    if (!validIds.has(p.wordId)) continue;
    for (const [distractorId, count] of Object.entries(p.missedAgainst)) {
      if (count <= 0 || !validIds.has(distractorId) || distractorId === p.wordId) continue;
      const key = pairKey(p.wordId, distractorId);
      const existing = pairs.get(key);
      if (existing) {
        existing.missedCount += count;
      } else {
        const [a, b] = key.split('|');
        pairs.set(key, { a, b, source: 'missed', missedCount: count });
      }
    }
  }

  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i];
      const b = words[j];
      const ta = a.term.toLowerCase();
      const tb = b.term.toLowerCase();
      if (ta === tb) continue;
      const dist = levenshtein(ta, tb);
      if (dist > 2) continue;
      const key = pairKey(a.id, b.id);
      const existing = pairs.get(key);
      if (existing) {
        existing.source = 'both';
        existing.editDistance = dist;
      } else {
        pairs.set(key, { a: a.id, b: b.id, source: 'orthographic', missedCount: 0, editDistance: dist });
      }
    }
  }

  return [...pairs.values()].sort((x, y) => {
    if (y.missedCount !== x.missedCount) return y.missedCount - x.missedCount;
    return (x.editDistance ?? 99) - (y.editDistance ?? 99);
  });
}

/** All word ids that appear in at least one confusion pair — the pool a
 * confusion drill (§4: "Offer a drill built only from them") is built
 * from. */
export function confusionPairWordIds(pairs: ConfusionPair[]): string[] {
  const ids = new Set<string>();
  for (const p of pairs) {
    ids.add(p.a);
    ids.add(p.b);
  }
  return [...ids];
}
