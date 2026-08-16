import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getMatchBest, setMatchBest } from '@/db/meta';
import { getWordsBySetPage } from '@/db/words';
import { useAsync } from '@/hooks/useAsync';
import { mulberry32, shuffle } from '@/lib/prng';
import type { Word } from '@/types/domain';

const MAX_PAIRS = 12;

interface Cell {
  cellId: string;
  wordId: string;
  kind: 'term' | 'definition';
  text: string;
}

function buildCells(words: Word[], seed: number): Cell[] {
  const pairs = words.slice(0, MAX_PAIRS);
  const cells: Cell[] = pairs.flatMap((w) => [
    { cellId: `${w.id}-term`, wordId: w.id, kind: 'term' as const, text: w.term },
    { cellId: `${w.id}-def`, wordId: w.id, kind: 'definition' as const, text: w.definition },
  ]);
  return shuffle(cells, mulberry32(seed));
}

function gridColumns(cellCount: number): number {
  return cellCount > 16 ? 6 : 4;
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

async function load(setId: string) {
  const [page, best] = await Promise.all([getWordsBySetPage(setId, { limit: MAX_PAIRS }), getMatchBest(setId)]);
  return { words: page.items, best };
}

/** Match (§3): timed grid, click a term then its definition (or vice
 * versa) to clear the pair. Timer to two decimals, personal best per set,
 * grid scales with pool size up to 6x4 (24 cells / 12 pairs). */
export default function MatchMode() {
  const { setId = '' } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => load(setId), [setId]);

  const [seed] = useState(() => Date.now() >>> 0);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<[string, string] | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finalMs, setFinalMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);

  const cells = useMemo(() => (data ? buildCells(data.words, seed) : []), [data, seed]);
  const totalPairs = data ? Math.min(MAX_PAIRS, data.words.length) : 0;
  const done = data && totalPairs > 0 && cleared.size === totalPairs;

  useEffect(() => {
    if (!startedAt || done) return;
    const id = window.setInterval(() => setNow(Date.now()), 47); // ~2 decimal-place-smooth refresh
    return () => window.clearInterval(id);
  }, [startedAt, done]);

  useEffect(() => {
    if (!done || finalMs !== null || !startedAt) return;
    const elapsed = Date.now() - startedAt;
    setFinalMs(elapsed);
    void (async () => {
      const best = await getMatchBest(setId);
      if (best === undefined || elapsed < best) {
        await setMatchBest(setId, elapsed);
        setIsNewBest(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, startedAt, finalMs, setId]);

  function handleClick(cell: Cell) {
    if (cleared.has(cell.wordId) || mismatch) return;
    if (!startedAt) setStartedAt(Date.now());

    if (!selected) {
      setSelected(cell.cellId);
      return;
    }
    if (selected === cell.cellId) {
      setSelected(null);
      return;
    }
    const first = cells.find((c) => c.cellId === selected);
    if (!first) return;

    if (first.wordId === cell.wordId && first.kind !== cell.kind) {
      setCleared((s) => new Set(s).add(cell.wordId));
      setSelected(null);
    } else {
      setMismatch([selected, cell.cellId]);
      window.setTimeout(() => {
        setMismatch(null);
        setSelected(null);
      }, 400);
    }
  }

  function restart() {
    setCleared(new Set());
    setSelected(null);
    setMismatch(null);
    setStartedAt(null);
    setFinalMs(null);
    setIsNewBest(false);
    reload();
  }

  if (loading) return <div className="p-6 font-body text-sm">Loading…</div>;
  if (error) return <div className="p-6 font-body text-sm">Couldn't load this set: {error.message}</div>;
  if (!data || totalPairs < 2) {
    return <div className="p-6 font-body text-sm">Need at least 2 words in this set to play Match.</div>;
  }

  const elapsedMs = finalMs ?? (startedAt ? now - startedAt : 0);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b-[4px] border-black bg-[var(--yellow)] px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        <span className="font-display uppercase text-xs">Match</span>
        <span className="font-display text-lg tabular-nums">{formatTime(elapsedMs)}</span>
        {data.best !== undefined && (
          <span className="font-body text-xs">Best: {formatTime(isNewBest ? finalMs ?? data.best : data.best)}</span>
        )}
        <button
          onClick={() => navigate('/')}
          className="font-display text-xs uppercase underline decoration-2 underline-offset-2"
        >
          Exit
        </button>
      </div>

      {done ? (
        <div className="max-w-sm mx-auto p-6 w-full">
          <Card className="bg-[var(--lime)] flex flex-col gap-3 items-start">
            <h1 className="font-display uppercase text-lg">{isNewBest ? 'New personal best!' : 'Cleared!'}</h1>
            <p className="font-body text-sm">Time: {formatTime(finalMs ?? 0)}</p>
            <div className="flex gap-2">
              <Button variant="paper" onClick={restart}>
                Play again
              </Button>
              <Button variant="ink" onClick={() => navigate('/')}>
                Home
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="p-4 sm:p-6">
          <div
            className="grid gap-2 max-w-3xl mx-auto"
            style={{ gridTemplateColumns: `repeat(${gridColumns(cells.length)}, minmax(0, 1fr))` }}
          >
            {cells.map((cell) => {
              const isCleared = cleared.has(cell.wordId);
              const isSelected = selected === cell.cellId;
              const isMismatch = mismatch?.includes(cell.cellId);
              let bg = 'var(--paper)';
              if (isMismatch) bg = 'var(--red)';
              else if (isSelected) bg = 'var(--yellow)';
              return (
                <button
                  key={cell.cellId}
                  onClick={() => handleClick(cell)}
                  disabled={isCleared}
                  data-word-id={cell.wordId}
                  data-kind={cell.kind}
                  className="press-surface p-2 sm:p-3 font-body text-xs sm:text-sm min-h-[64px] flex items-center justify-center text-center disabled:opacity-0 disabled:pointer-events-none"
                  style={{ background: bg }}
                >
                  {cell.text}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
