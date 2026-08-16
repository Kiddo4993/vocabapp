import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SessionBar } from '@/components/shell/SessionBar';
import { SessionComplete } from '@/components/session/SessionComplete';
import { MultipleChoiceQuestion } from '@/components/session/MultipleChoiceQuestion';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useLearnSession } from '@/hooks/useLearnSession';
import { isCloseEnough } from '@/lib/levenshtein';
import { buildMultipleChoiceOptions } from '@/lib/session';
import { mulberry32 } from '@/lib/prng';

/**
 * Learn (§3, adaptive): rounds of 7, question type escalates with mastery
 * (recognise -> recall -> produce), a miss re-enters the same round after
 * two intervening questions, and the session ends once every word in the
 * batch has been answered correctly at produce tier. See
 * src/hooks/useLearnSession.ts for the rotation/mastery mechanics.
 */
export default function LearnMode() {
  const { setId = '' } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const {
    loading,
    error,
    batchWords,
    masteredCount,
    currentWord,
    currentTier,
    questionShape,
    distractorPool,
    showRoundSummary,
    roundStats,
    isComplete,
    answer,
    dismissRoundSummary,
    restart,
  } = useLearnSession(setId);

  const [produceInput, setProduceInput] = useState('');
  const [produceResult, setProduceResult] = useState<'correct' | 'incorrect' | null>(null);
  const startRef = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProduceInput('');
    setProduceResult(null);
    startRef.current = Date.now();
    inputRef.current?.focus();
  }, [currentWord?.id]);

  if (loading) return <div className="p-6 font-body text-sm">Loading…</div>;
  if (error) return <div className="p-6 font-body text-sm">Couldn't load this set: {error.message}</div>;
  if (batchWords.length === 0) {
    return <div className="p-6 font-body text-sm">Nothing to study in this set yet.</div>;
  }
  if (isComplete) {
    return <SessionComplete total={batchWords.length} onRestart={restart} />;
  }

  if (showRoundSummary) {
    return (
      <div className="max-w-md mx-auto p-6">
        <Card className="bg-[var(--cyan)] flex flex-col gap-4 items-start">
          <h1 className="font-display uppercase text-lg">Round complete</h1>
          <p className="font-body text-sm">
            {roundStats.correct} / {roundStats.asked} correct this round
          </p>
          <p className="font-body text-sm">
            {masteredCount} / {batchWords.length} words mastered
          </p>
          <Button variant="ink" onClick={dismissRoundSummary}>
            Continue
          </Button>
        </Card>
      </div>
    );
  }

  if (!currentWord || !currentTier || !questionShape) return null;

  function handleMultipleChoice(input: { correct: boolean; ms: number; selectedIndex: number }, optionIds: string[]) {
    void answer({ correct: input.correct, ms: input.ms, distractorId: input.correct ? undefined : optionIds[input.selectedIndex] });
  }

  function handleProduceSubmit() {
    if (!currentWord) return;
    const correct = isCloseEnough(produceInput, currentWord.term) || currentWord.aliases.some((a) => a.toLowerCase() === produceInput.trim().toLowerCase());
    setProduceResult(correct ? 'correct' : 'incorrect');
  }

  async function handleProduceContinue() {
    if (!currentWord || !produceResult) return;
    await answer({ correct: produceResult === 'correct', ms: Date.now() - startRef.current, givenAnswer: produceInput });
  }

  function onProduceKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!produceResult) handleProduceSubmit();
    else void handleProduceContinue();
  }

  return (
    <div className="flex flex-col h-full">
      <SessionBar modeLabel="Learn" current={masteredCount} total={batchWords.length} onExit={() => navigate('/')} />

      <div className="flex-1 flex flex-col items-center gap-4 p-4 sm:p-6">
        <p className="font-display text-xs uppercase text-black/60">
          {questionShape === 'recognise' && 'Pick the definition'}
          {questionShape === 'recall' && 'Pick the term'}
          {questionShape === 'produce' && 'Type the term'}
        </p>

        {questionShape !== 'produce' && (
          <LearnMultipleChoice
            key={`${currentWord.id}-${currentTier}`}
            word={currentWord}
            pool={distractorPool}
            shape={questionShape}
            onAnswer={handleMultipleChoice}
          />
        )}

        {questionShape === 'produce' && (
          <div className="flex flex-col gap-4 w-full max-w-md">
            <div className="surface p-6 flex flex-col gap-2 items-center text-center">
              {currentWord.pos && <span className="font-body text-xs uppercase text-black/60">{currentWord.pos}</span>}
              <p className="font-body text-lg">{currentWord.definition}</p>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={produceInput}
              disabled={!!produceResult}
              onChange={(e) => setProduceInput(e.target.value)}
              onKeyDown={onProduceKeyDown}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="press-surface w-full px-4 py-3 font-body text-lg bg-[var(--paper)] disabled:opacity-70"
              aria-label="Type the term"
            />
            {!produceResult && (
              <Button variant="yellow" onClick={handleProduceSubmit} disabled={!produceInput.trim()}>
                Submit (Enter)
              </Button>
            )}
            {produceResult && (
              <div
                className="surface p-4 flex flex-col gap-3"
                style={{ background: produceResult === 'correct' ? 'var(--lime)' : 'var(--red)' }}
              >
                <p className="font-display uppercase text-sm">{produceResult === 'correct' ? 'Correct' : 'Not quite'}</p>
                <p className="font-body text-sm">
                  Correct term: <strong>{currentWord.term}</strong>
                </p>
                <Button variant="ink" onClick={() => void handleProduceContinue()}>
                  Continue (Enter)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LearnMultipleChoice({
  word,
  pool,
  shape,
  onAnswer,
}: {
  word: import('@/types/domain').Word;
  pool: import('@/types/domain').Word[];
  shape: 'recognise' | 'recall';
  onAnswer: (input: { correct: boolean; ms: number; selectedIndex: number }, optionIds: string[]) => void;
}) {
  const rng = mulberry32(hashSeed(word.id + shape));
  const { options, correctIndex } = buildMultipleChoiceOptions(word, pool, 3, rng);
  const optionIds = options.map((o) => o.id);

  if (shape === 'recognise') {
    return (
      <MultipleChoiceQuestion
        prompt={word.term}
        promptPos={word.pos}
        options={options}
        correctIndex={correctIndex}
        optionField="definition"
        onAnswer={(input) => onAnswer(input, optionIds)}
      />
    );
  }
  return (
    <MultipleChoiceQuestion
      prompt={word.definition}
      options={options}
      correctIndex={correctIndex}
      optionField="term"
      onAnswer={(input) => onAnswer(input, optionIds)}
    />
  );
}

/** Small deterministic string->uint32 hash so each (word, shape) pair gets
 * a stable-but-varied option shuffle without threading a running RNG
 * through the component tree. */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
