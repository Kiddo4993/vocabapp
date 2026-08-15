import { RouterProvider } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { loadSeedIfNeeded } from '@/db/seed';
import { router } from '@/router';

export default function App() {
  // First-run seed load (§2: fetched, never bundled) gates the router so
  // Home never renders against an empty, not-yet-seeded database. Already
  // a no-op after the first successful run (src/db/seed.ts).
  const { loading, error } = useAsync(() => loadSeedIfNeeded(), []);

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center p-6" role="status" aria-live="polite">
        <p className="font-display uppercase text-sm tracking-tight">Loading Vocab Lab…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="surface p-5 max-w-sm">
          <p className="font-display uppercase text-sm">Couldn't load your word bank</p>
          <p className="font-body text-xs mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
