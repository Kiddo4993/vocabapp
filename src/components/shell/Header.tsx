import { Link } from 'react-router-dom';

export function Header() {
  return (
    <header className="border-b-[4px] border-black bg-[var(--paper)] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      <Link
        to="/"
        className="font-display uppercase text-lg sm:text-xl tracking-tight press-surface px-3 py-1.5 bg-[var(--yellow)]"
      >
        Vocab Lab
      </Link>
      <nav className="flex gap-2 sm:gap-3 font-display uppercase text-xs sm:text-sm flex-wrap">
        <Link to="/how-to-use" className="press-surface px-3 py-1.5 bg-[var(--yellow)]">
          How to Use
        </Link>
        <Link to="/browse" className="press-surface px-3 py-1.5 bg-[var(--cyan)]">
          Browse
        </Link>
        <Link to="/stats" className="press-surface px-3 py-1.5 bg-[var(--violet)]">
          Stats
        </Link>
        <Link to="/backup" className="press-surface px-3 py-1.5 bg-[var(--lime)]">
          Backup
        </Link>
        <Link to="/import" className="press-surface px-3 py-1.5 bg-[var(--pink)]">
          Import
        </Link>
      </nav>
    </header>
  );
}
