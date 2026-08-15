import { useEffect, useRef, useState } from 'react';
import type { Word } from '@/types/domain';

export interface MultipleChoiceQuestionProps {
  prompt: string;
  promptPos?: string;
  /** The answer options, already shuffled by the caller (via
   * src/lib/session.ts buildMultipleChoiceOptions) so option order is
   * reproducible within a seeded session. */
  options: Word[];
  correctIndex: number;
  /** Which field of each option to display as the answer choice — Learn's
   * recognise tier shows definitions to pick from; its recall tier shows
   * terms. */
  optionField: 'term' | 'definition';
  onAnswer: (input: { correct: boolean; selectedIndex: number; ms: number }) => void;
  /** True once an answer has been locked in — parent controls advancing
   * away, this component just stops accepting input. */
  locked?: boolean;
}

/**
 * The shared multiple-choice question shape (§10.5) that Learn's recognise
 * tier and Test's "multiple choice" question type both build on (§3).
 * Fully keyboard-operable: press 1-4 to answer, matching the quality-floor
 * requirement in §7. Callers should pass `key={word.id}` (or similar) so
 * a new question mounts fresh rather than carrying over selection state.
 */
export function MultipleChoiceQuestion({
  prompt,
  promptPos,
  options,
  correctIndex,
  optionField,
  onAnswer,
  locked = false,
}: MultipleChoiceQuestionProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, options]);

  function choose(index: number) {
    if (selected !== null || locked) return;
    setSelected(index);
    onAnswer({ correct: index === correctIndex, selectedIndex: index, ms: Date.now() - startRef.current });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        choose(n - 1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, selected, locked]);

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <div className="surface p-6 flex flex-col gap-2 items-center text-center">
        {promptPos && <span className="font-body text-xs uppercase text-black/60">{promptPos}</span>}
        <p className="font-body text-lg">{prompt}</p>
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Answer options">
        {options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrectOption = i === correctIndex;
          const revealed = selected !== null;
          let bg = 'var(--paper)';
          if (revealed && isCorrectOption) bg = 'var(--lime)';
          else if (revealed && isSelected && !isCorrectOption) bg = 'var(--red)';

          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={revealed || locked}
              onClick={() => choose(i)}
              className="press-surface text-left px-4 py-3 font-body flex items-center gap-3 disabled:cursor-default"
              style={{ background: bg }}
            >
              <span className="font-display text-xs border-[3px] border-black w-6 h-6 flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span>{opt[optionField]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
