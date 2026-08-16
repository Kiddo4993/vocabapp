import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SessionBar } from '@/components/shell/SessionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getDeviceId } from '@/db/meta';
import { getProgressByIds, initialProgress, putProgress } from '@/db/progress';
import { putSession } from '@/db/sessions';
import { getWordsBySetPage } from '@/db/words';
import { useAsync } from '@/hooks/useAsync';
import { applyAnswer } from '@/lib/scheduler';
import { makeSessionSeed, mulberry32 } from '@/lib/prng';
import {
  buildTestQuestions,
  gradeQuestion,
  questionWordIds,
  type TestAnswer,
  type TestQuestion,
  type TestTypeConfig,
} from '@/lib/test';
import type { SessionAnswer, SessionRecord } from '@/types/domain';

type Phase = 'config' | 'running' | 'results';

const DEFAULT_TYPES: TestTypeConfig = { written: true, multipleChoice: true, trueFalse: true, matching: true };

async function loadPool(setId: string) {
  const page = await getWordsBySetPage(setId, { limit: 200 });
  return page.items;
}

/**
 * Test (§3): configured before it starts (question count + which types are
 * on), nothing graded until submit, results show every question with the
 * given vs. correct answer plus a "retake only what I missed" button.
 * Spaced-repetition state is only touched if the user opts in — a casual
 * test shouldn't wreck a schedule.
 */
export default function TestMode() {
  const { setId = '' } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const { data: pool, loading, error } = useAsync(() => loadPool(setId), [setId]);

  const [phase, setPhase] = useState<Phase>('config');
  const [questionCount, setQuestionCount] = useState(10);
  const [types, setTypes] = useState<TestTypeConfig>(DEFAULT_TYPES);
  const [affectsSchedule, setAffectsSchedule] = useState(false);

  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, TestAnswer>>({});
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const anyTypeOn = types.written || types.multipleChoice || types.trueFalse || types.matching;

  function start(sourceWords = pool ?? [], count = questionCount) {
    if (!pool) return;
    const seed = makeSessionSeed();
    const qs = buildTestQuestions(sourceWords, pool, count, types, mulberry32(seed));
    setQuestions(qs);
    setAnswers({});
    setCurrent(0);
    setPhase('running');
  }

  async function submitTest() {
    setSubmitting(true);
    const origin = await getDeviceId();
    const now = Date.now();
    const allWordIds = Array.from(new Set(questions.flatMap(questionWordIds)));
    const progressMap = await getProgressByIds(allWordIds);

    const sessionAnswers: SessionAnswer[] = [];
    for (const q of questions) {
      const correct = gradeQuestion(q, answers[q.id]);
      for (const wordId of questionWordIds(q)) {
        sessionAnswers.push({ wordId, correct, ms: 0 });
        if (affectsSchedule) {
          const progress = progressMap.get(wordId) ?? initialProgress(wordId, setId, now, origin);
          const next = applyAnswer(progress, { correct, now, ms: 0, origin });
          progressMap.set(wordId, next);
          await putProgress(next);
        }
      }
    }

    const session: SessionRecord = {
      id: crypto.randomUUID(),
      mode: 'test',
      setIds: [setId],
      seed: 0,
      queue: [],
      currentIndex: sessionAnswers.length,
      answers: sessionAnswers,
      startedAt: now,
      completedAt: now,
      updatedAt: now,
      origin,
    };
    await putSession(session);

    setSubmitting(false);
    setPhase('results');
  }

  const score = useMemo(() => {
    let correct = 0;
    for (const q of questions) if (gradeQuestion(q, answers[q.id])) correct++;
    return { correct, total: questions.length };
  }, [questions, answers]);

  const missedWordIds = useMemo(
    () => questions.filter((q) => !gradeQuestion(q, answers[q.id])).flatMap(questionWordIds),
    [questions, answers],
  );

  if (loading) return <div className="p-6 font-body text-sm">Loading…</div>;
  if (error) return <div className="p-6 font-body text-sm">Couldn't load this set: {error.message}</div>;
  if (!pool || pool.length === 0) return <div className="p-6 font-body text-sm">Nothing to test in this set yet.</div>;

  if (phase === 'config') {
    return (
      <div className="max-w-md mx-auto p-4 sm:p-6 flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <h1 className="font-display uppercase text-lg">Configure test</h1>

          <label className="flex flex-col gap-1">
            <span className="font-display text-xs uppercase">Question count</span>
            <input
              type="number"
              min={1}
              max={pool.length * 2}
              value={questionCount}
              onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value) || 1))}
              className="press-surface px-3 py-2 font-body w-24"
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-display text-xs uppercase mb-1">Question types</legend>
            {(
              [
                ['written', 'Written'],
                ['multipleChoice', 'Multiple choice'],
                ['trueFalse', 'True / False'],
                ['matching', 'Matching'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 font-body text-sm">
                <input
                  type="checkbox"
                  checked={types[key]}
                  onChange={(e) => setTypes((t) => ({ ...t, [key]: e.target.checked }))}
                  className="w-5 h-5 accent-black"
                />
                {label}
              </label>
            ))}
          </fieldset>

          <label className="flex items-center gap-2 font-body text-sm">
            <input
              type="checkbox"
              checked={affectsSchedule}
              onChange={(e) => setAffectsSchedule(e.target.checked)}
              className="w-5 h-5 accent-black"
            />
            Also update my spaced-repetition schedule
          </label>

          <Button variant="yellow" disabled={!anyTypeOn} onClick={() => start()}>
            Start test
          </Button>
        </Card>
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
        <Card className="bg-[var(--yellow)]">
          <p className="font-display uppercase text-xs">Score</p>
          <p className="font-display text-4xl">
            {score.correct} / {score.total}
          </p>
        </Card>

        <div className="flex flex-col gap-2">
          {questions.map((q) => {
            const correct = gradeQuestion(q, answers[q.id]);
            const givenLabel = describeAnswer(q, answers[q.id]);
            const correctLabel = describeCorrectAnswer(q);
            const prompt = q.type === 'matching' ? q.words.map((w) => w.term).join(', ') : q.word.term;
            return (
              <Card key={q.id} style={{ background: correct ? 'var(--lime)' : 'var(--red)' }}>
                <p className="font-display text-xs uppercase">{prompt}</p>
                <p className="font-body text-sm mt-1">Your answer: {givenLabel}</p>
                <p className="font-body text-sm">Correct answer: {correctLabel}</p>
              </Card>
            );
          })}
        </div>

        <div className="flex gap-2 flex-wrap">
          {missedWordIds.length > 0 && (
            <Button
              variant="violet"
              onClick={async () => {
                const missedWords = pool.filter((w) => missedWordIds.includes(w.id));
                start(missedWords, missedWords.length);
              }}
            >
              Retake only what I missed
            </Button>
          )}
          <Button variant="paper" onClick={() => setPhase('config')}>
            New test
          </Button>
          <Button variant="ink" onClick={() => navigate('/')}>
            Home
          </Button>
        </div>
      </div>
    );
  }

  // running
  const q = questions[current];
  if (!q) return null;

  return (
    <div className="flex flex-col h-full">
      <SessionBar modeLabel="Test" current={current} total={questions.length} onExit={() => navigate('/')} />
      <div className="flex-1 flex flex-col items-center gap-4 p-4 sm:p-6">
        <TestQuestionView
          question={q}
          answer={answers[q.id]}
          onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
        />
        <div className="flex gap-2">
          {current > 0 && (
            <Button variant="paper" onClick={() => setCurrent((c) => c - 1)}>
              Back
            </Button>
          )}
          {current < questions.length - 1 ? (
            <Button variant="yellow" onClick={() => setCurrent((c) => c + 1)}>
              Next
            </Button>
          ) : (
            <Button variant="lime" disabled={submitting} onClick={() => void submitTest()}>
              {submitting ? 'Submitting…' : 'Submit test'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TestQuestionView({
  question,
  answer,
  onChange,
}: {
  question: TestQuestion;
  answer: TestAnswer;
  onChange: (a: TestAnswer) => void;
}) {
  if (question.type === 'written') {
    return (
      <div className="w-full max-w-md flex flex-col gap-3">
        <div className="surface p-6 text-center">
          <p className="font-body text-lg">{question.word.definition}</p>
        </div>
        <input
          type="text"
          value={answer?.type === 'written' ? answer.guess : ''}
          onChange={(e) => onChange({ type: 'written', guess: e.target.value })}
          autoComplete="off"
          spellCheck={false}
          className="press-surface w-full px-4 py-3 font-body text-lg bg-[var(--paper)]"
          aria-label="Type the term"
        />
      </div>
    );
  }

  if (question.type === 'multiple-choice') {
    return (
      <div className="w-full max-w-md flex flex-col gap-3">
        <div className="surface p-6 text-center">
          <p className="font-body text-lg">{question.word.term}</p>
        </div>
        <div className="flex flex-col gap-2" role="radiogroup">
          {question.options.map((opt, i) => (
            <button
              key={opt.id}
              onClick={() => onChange({ type: 'multiple-choice', selectedIndex: i })}
              className="press-surface text-left px-4 py-3 font-body flex items-center gap-3"
              style={{ background: answer?.type === 'multiple-choice' && answer.selectedIndex === i ? 'var(--yellow)' : 'var(--paper)' }}
            >
              <span className="font-display text-xs border-[3px] border-black w-6 h-6 flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              {opt.definition}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === 'true-false') {
    return (
      <div className="w-full max-w-md flex flex-col gap-3">
        <div className="surface p-6 text-center flex flex-col gap-2">
          <p className="font-display uppercase">{question.word.term}</p>
          <p className="font-body text-lg">{question.shownDefinition}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={answer?.type === 'true-false' && answer.guess ? 'lime' : 'paper'}
            onClick={() => onChange({ type: 'true-false', guess: true })}
          >
            True
          </Button>
          <Button
            variant={answer?.type === 'true-false' && !answer.guess ? 'pink' : 'paper'}
            onClick={() => onChange({ type: 'true-false', guess: false })}
          >
            False
          </Button>
        </div>
      </div>
    );
  }

  // matching
  const pairs = answer?.type === 'matching' ? answer.pairs : {};
  return (
    <div className="w-full max-w-md flex flex-col gap-3">
      <p className="font-display text-xs uppercase text-black/60">Match each term to its definition</p>
      {question.words.map((w) => (
        <div key={w.id} className="flex items-center gap-2">
          <span className="font-body text-sm w-28 shrink-0">{w.term}</span>
          <select
            value={pairs[w.id] ?? ''}
            onChange={(e) =>
              onChange({ type: 'matching', pairs: { ...pairs, [w.id]: e.target.value } })
            }
            className="press-surface flex-1 px-3 py-2 font-body text-sm bg-[var(--paper)]"
          >
            <option value="" disabled>
              Choose a definition…
            </option>
            {question.shuffledDefinitionOrder.map((defOwnerId) => {
              const owner = question.words.find((ww) => ww.id === defOwnerId);
              return owner ? (
                <option key={defOwnerId} value={defOwnerId}>
                  {owner.definition}
                </option>
              ) : null;
            })}
          </select>
        </div>
      ))}
    </div>
  );
}

function describeAnswer(q: TestQuestion, a: TestAnswer): string {
  if (!a) return '(no answer)';
  if (a.type === 'written') return a.guess || '(blank)';
  if (a.type === 'multiple-choice' && q.type === 'multiple-choice') return q.options[a.selectedIndex]?.definition ?? '(blank)';
  if (a.type === 'true-false') return a.guess ? 'True' : 'False';
  if (a.type === 'matching' && q.type === 'matching') {
    return q.words.map((w) => `${w.term} -> ${q.words.find((ww) => ww.id === a.pairs[w.id])?.term ?? '?'}`).join('; ');
  }
  return '(no answer)';
}

function describeCorrectAnswer(q: TestQuestion): string {
  if (q.type === 'written') return q.word.term;
  if (q.type === 'multiple-choice') return q.options[q.correctIndex]?.definition ?? '';
  if (q.type === 'true-false') return q.isActuallyTrue ? 'True' : 'False';
  return q.words.map((w) => `${w.term} -> ${w.term}`).join('; ');
}
