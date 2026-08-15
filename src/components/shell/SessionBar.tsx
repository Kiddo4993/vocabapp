export interface SessionBarProps {
  modeLabel: string;
  current: number;
  total: number;
  onExit?: () => void;
}

/** Shown by every session-backed study mode (Flashcards/Learn/Test/Match/
 * Write) — a consistent progress readout plus an exit affordance so
 * leaving mid-session is always one click/tap away. */
export function SessionBar({ modeLabel, current, total, onExit }: SessionBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="border-b-[4px] border-black bg-[var(--yellow)] px-4 sm:px-6 py-2 flex items-center gap-3 sm:gap-4">
      <span className="font-display uppercase text-xs whitespace-nowrap">{modeLabel}</span>
      <div
        className="flex-1 h-3 border-[3px] border-black bg-[var(--paper)]"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-label={`${modeLabel} progress`}
      >
        <div className="h-full bg-[var(--ink)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-body text-xs whitespace-nowrap tabular-nums">
        {current}/{total}
      </span>
      {onExit && (
        <button
          onClick={onExit}
          className="font-display text-xs uppercase underline decoration-2 underline-offset-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-black"
        >
          Exit
        </button>
      )}
    </div>
  );
}
