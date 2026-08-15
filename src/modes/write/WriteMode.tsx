import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SessionBar } from '@/components/shell/SessionBar';
import { SessionComplete } from '@/components/session/SessionComplete';
import { Button } from '@/components/ui/Button';
import { addWordAlias } from '@/db/words';
import { useSession } from '@/hooks/useSession';
import { isCloseEnough } from '@/lib/levenshtein';

type Grade = 'correct' | 'close' | 'incorrect';

function grade(guess: string, term: string, aliases: string[]): Grade {
  const g = guess.trim().toLowerCase();
  if (g === term.trim().toLowerCase()) return 'correct';
  if (aliases.some((a) => a.toLowerCase() === g)) return 'correct';
  if (isCloseEnough(guess, term)) return 'close';
  return 'incorrect';
}

/**
 * Write (§3): definition shown, type the term. One-character typos are
 * forgiven via Levenshtein <= 1 on words longer than five characters. An
 * "I was right" override marks a genuine miss correct and records the
 * spelling as an alias so the same near-miss is accepted outright next
 * time.
 */
export default function WriteMode() {
  const { setId = '' } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const { loading, error, session, words, currentIndex, currentWord, isComplete, submitAnswer, restart } =
    useSession(setId, 'write');

  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<Grade | null>(null);
  const startRef = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setResult(null);
    startRef.current = Date.now();
    inputRef.current?.focus();
  }, [currentIndex]);

  if (loading) return <div className="p-6 font-body text-sm">Loading…</div>;
  if (error) return <div className="p-6 font-body text-sm">Couldn't load this set: {error.message}</div>;
  if (!session || words.length === 0) {
    return <div className="p-6 font-body text-sm">Nothing to study in this set yet.</div>;
  }
  if (isComplete) {
    const correct = session.answers.filter((a) => a.correct).length;
    return <SessionComplete correct={correct} total={words.length} onRestart={restart} />;
  }
  if (!currentWord) return null;

  const ms = () => Date.now() - startRef.current;

  function handleSubmitGrade() {
    if (!currentWord) return;
    const g = grade(input, currentWord.term, currentWord.aliases);
    setResult(g);
    setSubmitted(true);
  }

  async function handleContinue(finalGrade: Grade) {
    if (!currentWord) return;
    await submitAnswer({ correct: finalGrade !== 'incorrect', ms: ms(), givenAnswer: input });
  }

  async function handleIWasRight() {
    if (!currentWord) return;
    await addWordAlias(currentWord.id, input);
    await submitAnswer({ correct: true, ms: ms(), givenAnswer: input });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!submitted) {
      handleSubmitGrade();
    } else if (result) {
      void handleContinue(result);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <SessionBar modeLabel="Write" current={currentIndex} total={words.length} onExit={() => navigate('/')} />

      <div className="flex-1 flex flex-col items-center gap-4 p-4 sm:p-6">
        <div className="surface w-full max-w-md p-6 flex flex-col gap-2 items-center text-center">
          {currentWord.pos && <span className="font-body text-xs uppercase text-black/60">{currentWord.pos}</span>}
          <p className="font-body text-lg">{currentWord.definition}</p>
        </div>

        <div className="w-full max-w-md flex flex-col gap-2">
          <label htmlFor="write-input" className="font-display text-xs uppercase">
            Type the term
          </label>
          <input
            id="write-input"
            ref={inputRef}
            type="text"
            value={input}
            disabled={submitted}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="press-surface w-full px-4 py-3 font-body text-lg bg-[var(--paper)] disabled:opacity-70"
          />
        </div>

        {!submitted && (
          <Button variant="yellow" onClick={handleSubmitGrade} disabled={!input.trim()}>
            Submit (Enter)
          </Button>
        )}

        {submitted && result && (
          <div
            className="surface w-full max-w-md p-4 flex flex-col gap-3"
            style={{ background: result === 'incorrect' ? 'var(--red)' : 'var(--lime)' }}
          >
            <p className="font-display uppercase text-sm">
              {result === 'correct' && 'Correct'}
              {result === 'close' && 'Close enough — accepted'}
              {result === 'incorrect' && 'Not quite'}
            </p>
            <p className="font-body text-sm">
              Correct term: <strong>{currentWord.term}</strong>
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="ink" onClick={() => void handleContinue(result)}>
                Continue (Enter)
              </Button>
              {result === 'incorrect' && (
                <Button variant="paper" onClick={() => void handleIWasRight()}>
                  I was right
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="font-body text-xs text-black/60 text-center max-w-md">
          Enter to submit, Enter again to continue.
        </p>
      </div>
    </div>
  );
}
