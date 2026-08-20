import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MultipleChoiceQuestion } from '@/components/session/MultipleChoiceQuestion';
import { Button } from '@/components/ui/Button';
import { BoxChip } from '@/components/ui/BoxChip';
import { Card } from '@/components/ui/Card';
import { getSets } from '@/db/meta';
import { getWordsByIds } from '@/db/words';
import { useAsync } from '@/hooks/useAsync';
import { useWorkerRequest } from '@/hooks/useWorker';
import { confusionPairWordIds, type ConfusionPair } from '@/lib/confusion';
import { buildMultipleChoiceOptions } from '@/lib/session';
import { mulberry32 } from '@/lib/prng';
import type { BoxDistribution, SetStats } from '@/lib/stats';
import type { LeitnerBox, SetInfo, Word } from '@/types/domain';

const BOX_LABELS: Record<LeitnerBox, string> = { 1: 'Box 1', 2: 'Box 2', 3: 'Box 3', 4: 'Box 4', 5: 'Box 5' };

async function loadStats(request: ReturnType<typeof useWorkerRequest>['request'], setId: string) {
  const res = await request({ type: 'stats:compute', payload: { setId } });
  if (res.type !== 'stats:result') throw new Error('Unexpected worker response');
  return res.payload as { stats: SetStats; confusionPairs: ConfusionPair[] };
}

export default function StatsScreen() {
  const { data: sets } = useAsync(() => getSets(), []);
  const { request } = useWorkerRequest();
  const [setId, setSetId] = useState<string>('');

  const activeSetId = setId || sets?.[0]?.id || '';
  const { data, loading, error } = useAsync(
    () => (activeSetId ? loadStats(request, activeSetId) : Promise.resolve(undefined)),
    [activeSetId],
  );

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display uppercase text-lg">Stats</h1>
        <select
          value={activeSetId}
          onChange={(e) => setSetId(e.target.value)}
          className="press-surface px-3 py-2 font-body text-sm bg-[var(--paper)]"
        >
          {(sets ?? []).map((s: SetInfo) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Link to="/study-guide">
          <Button variant="violet">Study guide</Button>
        </Link>
        <Link to="/audio-review">
          <Button variant="cyan">Audio review</Button>
        </Link>
        <Link to="/enrichment">
          <Button variant="paper">Enrichment</Button>
        </Link>
      </div>

      {loading && <p className="font-body text-sm">Loading…</p>}
      {error && <p className="font-body text-sm">Couldn't load stats: {error.message}</p>}

      {data && (
        <>
          <Card>
            <h2 className="font-display uppercase text-sm mb-3">Box distribution</h2>
            <BoxDistributionBars distribution={data.stats.boxDistribution} total={data.stats.totalWords} />
          </Card>

          <Card>
            <h2 className="font-display uppercase text-sm mb-3">Accuracy trend (last 30 sessions)</h2>
            {data.stats.accuracyTrend.length === 0 ? (
              <p className="font-body text-sm text-black/60">No sessions yet.</p>
            ) : (
              <div className="flex items-end gap-1 h-24">
                {data.stats.accuracyTrend.map((pt) => (
                  <div
                    key={pt.sessionId}
                    title={`${Math.round(pt.accuracy * 100)}% (${pt.mode})`}
                    className="flex-1 bg-[var(--lime)] border-[2px] border-black"
                    style={{ height: `${Math.max(4, pt.accuracy * 100)}%` }}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-display uppercase text-sm mb-3">Slowest words</h2>
            {data.stats.slowestWords.length === 0 ? (
              <p className="font-body text-sm text-black/60">Not enough data yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 font-body text-sm">
                {data.stats.slowestWords.map((s) => (
                  <li key={s.wordId} className="flex justify-between">
                    <span>{s.wordId}</span>
                    <span className="tabular-nums text-black/60">{(s.avgMs / 1000).toFixed(1)}s avg</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-display uppercase text-sm mb-3">Never once answered correctly</h2>
            {data.stats.neverCorrectWordIds.length === 0 ? (
              <p className="font-body text-sm text-black/60">None — nice work.</p>
            ) : (
              <p className="font-body text-sm">{data.stats.neverCorrectWordIds.join(', ')}</p>
            )}
          </Card>

          <Card className="bg-[var(--pink)]">
            <h2 className="font-display uppercase text-sm mb-3">Confusion pairs</h2>
            {data.confusionPairs.length === 0 ? (
              <p className="font-body text-sm">None detected yet.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1 font-body text-sm mb-3">
                  {data.confusionPairs.slice(0, 10).map((p) => (
                    <li key={`${p.a}-${p.b}`}>
                      <strong>{p.a}</strong> vs <strong>{p.b}</strong>
                      {p.missedCount > 0 ? ` — missed ${p.missedCount}x` : ' — similar spelling'}
                    </li>
                  ))}
                </ul>
                <ConfusionDrill pairs={data.confusionPairs} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function BoxDistributionBars({ distribution, total }: { distribution: BoxDistribution; total: number }) {
  const boxes: LeitnerBox[] = [1, 2, 3, 4, 5];
  return (
    <div className="flex flex-col gap-2">
      {boxes.map((box) => {
        const count = distribution[box];
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={box} className="flex items-center gap-2">
            <BoxChip box={box} />
            <span className="font-body text-xs w-14">{BOX_LABELS[box]}</span>
            <div className="flex-1 h-5 border-[2px] border-black bg-[var(--paper)]">
              <div className="h-full" style={{ width: `${pct}%`, background: `var(--box-${box})` }} />
            </div>
            <span className="font-body text-xs w-8 text-right tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A lightweight, ungraded drill built only from confusion-pair words
 * (§4) — doesn't touch the scheduler or persist a session, just a quick
 * review pass over the words most likely to trip someone up. */
function ConfusionDrill({ pairs }: { pairs: ConfusionPair[] }) {
  const wordIds = confusionPairWordIds(pairs);
  const { data: words } = useAsync(() => getWordsByIds(wordIds), [wordIds.join(',')]);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);

  if (!words || words.length < 2) return null;

  if (!started) {
    return (
      <Button variant="ink" onClick={() => setStarted(true)}>
        Drill these {words.length} words
      </Button>
    );
  }

  if (index >= words.length) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-body text-sm">Drill complete.</p>
        <Button
          variant="paper"
          onClick={() => {
            setIndex(0);
          }}
        >
          Again
        </Button>
      </div>
    );
  }

  const word = words[index];
  const rng = mulberry32(index + 1);
  const { options, correctIndex } = buildMultipleChoiceOptions(word, words as Word[], 3, rng);

  return (
    <div key={word.id} className="flex flex-col gap-2">
      <MultipleChoiceQuestion
        prompt={word.term}
        promptPos={word.pos}
        options={options}
        correctIndex={correctIndex}
        optionField="definition"
        onAnswer={() => {
          window.setTimeout(() => setIndex((i) => i + 1), 500);
        }}
      />
    </div>
  );
}
