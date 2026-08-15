import type { LeitnerBox } from '@/types/domain';

const BOX_COLOR: Record<LeitnerBox, string> = {
  1: 'var(--box-1)',
  2: 'var(--box-2)',
  3: 'var(--box-3)',
  4: 'var(--box-4)',
  5: 'var(--box-5)',
};

/** Every Leitner box owns a colour, and it means the same thing on every
 * screen (§7) — this is the one place that mapping lives. */
export function BoxChip({ box, className = '' }: { box: LeitnerBox; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center border-[3px] border-black font-display text-xs leading-none w-6 h-6 ${className}`}
      style={{ background: BOX_COLOR[box] }}
      title={`Box ${box}`}
    >
      {box}
    </span>
  );
}
