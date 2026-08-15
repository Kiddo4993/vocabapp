import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';

function RouteFallback() {
  return (
    <div className="p-6 font-body" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

/** Top-level layout: header + routed content. Each study mode is its own
 * lazy route (§2 bundle budget), so route transitions show a minimal
 * fallback rather than blocking on the whole app bundle. */
export function AppShell() {
  return (
    <div className="min-h-full flex flex-col dot-grid">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
