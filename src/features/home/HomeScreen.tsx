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
          <Card key={set.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-display uppercase text-base tracking-tight">{set.name}</h2>
              <p className="font-body text-xs mt-1">
                {set.total} word{set.total === 1 ? '' : 's'} · {set.due} due
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link to={`/study/${set.id}/flashcards`}>
                <Button variant="pink">Flashcards</Button>
              </Link>
              <Link to={`/study/${set.id}/learn`}>
                <Button variant="cyan">Learn</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
