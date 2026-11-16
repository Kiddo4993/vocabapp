import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAsync } from '@/hooks/useAsync';
import { getSets } from '@/db/meta';
import { getDueCount } from '@/db/progress';
import { countWordsInSet } from '@/db/words';
import type { SetInfo } from '@/types/domain';

interface SetSummary extends SetInfo {
  due: number;
  total: number;
}

async function loadSummaries(): Promise<SetSummary[]> {
  const sets = await getSets();
  const now = Date.now();
  return Promise.all(
    sets
      .filter((s) => !s.deleted)
      .map(async (s) => ({
        ...s,
        due: await getDueCount(s.id, now),
        total: await countWordsInSet(s.id),
      })),
  );
}

export default function HomeScreen() {
  const { data: sets, loading, error } = useAsync(loadSummaries, []);

  const totalDue = sets?.reduce((sum, s) => sum + s.due, 0) ?? 0;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 flex flex-col gap-6">
      <Card className="bg-[var(--yellow)]">
        <p className="font-display uppercase text-xs tracking-tight">Due today</p>
        <p className="font-display text-5xl leading-none mt-2">{loading ? '—' : totalDue}</p>
      </Card>

      <Card className="bg-[var(--cyan)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="font-display uppercase text-xs tracking-tight">Need a walkthrough?</p>
          <p className="font-body text-xs mt-1 text-black/80">
            Learn how the 5-box Leitner system, 5 study modes, and shortcuts work.
          </p>
        </div>
        <Link to="/how-to-use">
          <Button variant="ink">How to Use App →</Button>
        </Link>
      </Card>

      {error && (
        <Card className="bg-[var(--red)]">
          <p className="font-body text-sm">Couldn't load your sets: {error.message}</p>
        </Card>
      )}

      {loading && <p className="font-body text-sm px-1">Loading sets…</p>}

      {!loading && sets && sets.length === 0 && (
        <Card>
          <p className="font-body text-sm">
            No sets yet. Seed data loads automatically on first run — refresh if this doesn't change.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {sets?.map((set) => (
          <Card key={set.id} className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b-[2px] border-black pb-2">
              <div>
                <h2 className="font-display uppercase text-base tracking-tight">{set.name}</h2>
                <p className="font-body text-xs mt-0.5 text-black/70">
                  {set.total} word{set.total === 1 ? '' : 's'} · {set.due} due
                </p>
              </div>
              <span className="font-mono text-xs uppercase px-2 py-0.5 bg-[var(--paper)] border-[1.5px] border-black self-start sm:self-auto">
                {set.due > 0 ? `${set.due} due for review` : 'All caught up!'}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <span className="font-display text-xs uppercase text-black/60 mr-1">Study:</span>
              <Link to={`/study/${set.id}/flashcards`}>
                <Button variant="pink">Flashcards</Button>
              </Link>
              <Link to={`/study/${set.id}/learn`}>
                <Button variant="cyan">Learn</Button>
              </Link>
              <Link to={`/study/${set.id}/write`}>
                <Button variant="violet">Write</Button>
              </Link>
              <Link to={`/study/${set.id}/test`}>
                <Button variant="lime">Test</Button>
              </Link>
              <Link to={`/study/${set.id}/match`}>
                <Button variant="yellow">Match</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
