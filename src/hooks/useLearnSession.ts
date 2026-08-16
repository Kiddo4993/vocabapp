import { useCallback, useEffect, useRef, useState } from 'react';
import { getDeviceId } from '@/db/meta';
import { getDueWordIds, getProgressByIds, initialProgress, putProgress } from '@/db/progress';
import { getActiveSession, putSession } from '@/db/sessions';
import { getWordsByIds, getWordsBySetPage } from '@/db/words';
import { applyAnswer } from '@/lib/scheduler';
import { mulberry32, shuffle } from '@/lib/prng';
import { MAX_SESSION_QUEUE } from '@/lib/session';
import type { ProgressRecord, QuestionTier, SessionAnswer, SessionRecord, Word } from '@/types/domain';

/**
 * Learn's session shape (§3) is genuinely different from the linear
 * queue-plus-index model the other modes share (src/hooks/useSession.ts):
 * a word can need several correct answers, at escalating tiers, before
 * it's done, and a miss re-inserts the word a couple of questions later
 * rather than just moving on. Rather than bending the shared session
 * runner to fit, Learn gets its own hook — but it still persists to the
 * same `sessions` store in the same SessionRecord shape, reusing
 * `session.queue` as a *live, shrinking, reorderable* rotation instead of
 * a fixed list walked by index. That's what makes resumability free: the
 * queue on disk IS the current rotation state, so reopening a killed tab
 * just re-reads it — no separate reconstruction/replay step needed.
 *
 * Rounds of 7 (§3) are a display grouping over the continuous rotation: a
 * round summary shows every 7 answered questions. A miss reinserts 2
 * questions later via a simple queue splice, which lands it back within
 * the same round in the overwhelming majority of cases. A word is
 * "mastered" (leaves the queue for good) the moment it's answered
 * correctly while its tier was already 'produce' — since queue only ever
 * shrinks on mastery, `batchWords.length - queue.length` is always the
 * exact mastered count, no bookkeeping required.
 */

const ROUND_SIZE = 7;
const REENTRY_DELAY = 2;
const DISTRACTOR_POOL_LIMIT = 80;
const MIN_POOL_FOR_MULTIPLE_CHOICE = 3;

export type LearnQuestionShape = 'recognise' | 'recall' | 'produce';

export interface UseLearnSessionResult {
  loading: boolean;
  error: Error | undefined;
  session: SessionRecord | undefined;
  batchWords: Word[];
  masteredCount: number;
  currentWord: Word | undefined;
  currentTier: QuestionTier | undefined;
  /** What to actually show for the current question — falls back to
   * 'produce' when the set doesn't have enough other words to build a
   * meaningful multiple-choice question. */
  questionShape: LearnQuestionShape | undefined;
  distractorPool: Word[];
  showRoundSummary: boolean;
  roundStats: { asked: number; correct: number };
  isComplete: boolean;
  progressByWordId: Map<string, ProgressRecord>;
  answer: (input: { correct: boolean; ms: number; distractorId?: string; givenAnswer?: string }) => Promise<void>;
  dismissRoundSummary: () => void;
  restart: () => Promise<void>;
}

export function useLearnSession(setId: string): UseLearnSessionResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [session, setSession] = useState<SessionRecord>();
  const [batchWords, setBatchWords] = useState<Word[]>([]);
  const [distractorPool, setDistractorPool] = useState<Word[]>([]);
  const [progressByWordId, setProgressByWordId] = useState<Map<string, ProgressRecord>>(new Map());
  const [dismissedThroughAnswerCount, setDismissedThroughAnswerCount] = useState(0);
  const initKey = useRef('');

  const init = useCallback(async () => {
    try {
      setLoading(true);
      setError(undefined);
      const origin = await getDeviceId();
      const now = Date.now();

      let active = await getActiveSession();
      if (active && (active.mode !== 'learn' || active.setIds[0] !== setId)) active = undefined;

      let s: SessionRecord;
      if (active) {
        s = active;
      } else {
        const dueIds = await getDueWordIds(setId, now, MAX_SESSION_QUEUE);
        const seed = Date.now() >>> 0;
        const queue = shuffle(dueIds, mulberry32(seed));
        s = {
          id: crypto.randomUUID(),
          mode: 'learn',
          setIds: [setId],
          seed,
          queue,
          currentIndex: 0,
          answers: [],
          startedAt: now,
          updatedAt: now,
          origin,
        };
        await putSession(s);
      }

      // batchWords is the full original set (queue only ever shrinks from
      // here), loaded once so mastered words stay visible in round stats.
      const allIds = active ? Array.from(new Set([...s.queue, ...s.answers.map((a) => a.wordId)])) : s.queue;
      const [loadedWords, progressMap, poolPage] = await Promise.all([
        getWordsByIds(allIds),
        getProgressByIds(allIds),
        getWordsBySetPage(setId, { limit: DISTRACTOR_POOL_LIMIT }),
      ]);
      for (const w of loadedWords) {
        if (!progressMap.has(w.id)) {
          const p = initialProgress(w.id, w.setId, now, origin);
          progressMap.set(w.id, p);
          await putProgress(p);
        }
      }

      setSession(s);
      setBatchWords(loadedWords);
      setDistractorPool(poolPage.items);
      setProgressByWordId(progressMap);
      setDismissedThroughAnswerCount(s.answers.length - (s.answers.length % ROUND_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    if (initKey.current === setId) return;
    initKey.current = setId;
    void init();
  }, [setId, init]);

  const wordsById = new Map(batchWords.map((w) => [w.id, w]));
  const currentWordId = session?.queue[0];
  const currentWord = currentWordId ? wordsById.get(currentWordId) : undefined;
  const currentProgress = currentWordId ? progressByWordId.get(currentWordId) : undefined;
  const currentTier = currentProgress?.tier;

  const poolExcludingCurrent = distractorPool.filter((w) => w.id !== currentWordId);
  const hasEnoughForMultipleChoice = poolExcludingCurrent.length >= MIN_POOL_FOR_MULTIPLE_CHOICE;
  const questionShape: LearnQuestionShape | undefined = !currentTier
    ? undefined
    : currentTier === 'produce' || !hasEnoughForMultipleChoice
      ? 'produce'
      : currentTier;

  const answersSoFar = session?.answers.length ?? 0;
  const showRoundSummary = answersSoFar > 0 && answersSoFar % ROUND_SIZE === 0 && answersSoFar > dismissedThroughAnswerCount;
  const roundStart = Math.max(0, answersSoFar - ROUND_SIZE);
  const roundAnswers = session?.answers.slice(roundStart, answersSoFar) ?? [];
  const roundStats = {
    asked: roundAnswers.length,
    correct: roundAnswers.filter((a) => a.correct).length,
  };

  const isComplete = !!session && session.queue.length === 0 && batchWords.length > 0;

  const answer = useCallback(
    async (input: { correct: boolean; ms: number; distractorId?: string; givenAnswer?: string }) => {
      if (!session || !currentWordId) return;
      const origin = await getDeviceId();
      const now = Date.now();
      const progress = progressByWordId.get(currentWordId) ?? initialProgress(currentWordId, setId, now, origin);
      const tierAtAnswer = progress.tier;

      const nextProgress = applyAnswer(progress, {
        correct: input.correct,
        now,
        ms: input.ms,
        distractorId: input.distractorId,
        origin,
      });
      await putProgress(nextProgress);
      setProgressByWordId((m) => new Map(m).set(currentWordId, nextProgress));

      // Advance the live rotation: drop the front, apply the re-entry /
      // mastery rule, release any re-entries whose countdown elapsed.
      let rest = session.queue.slice(1);
      const masteredNow = input.correct && tierAtAnswer === 'produce';

      if (!input.correct) {
        // Re-enters after two intervening questions — splice it in at
        // index REENTRY_DELAY (or the end, if the queue's shorter).
        const insertAt = Math.min(REENTRY_DELAY, rest.length);
        rest = [...rest.slice(0, insertAt), currentWordId, ...rest.slice(insertAt)];
      } else if (!masteredNow) {
        // Correct but not yet at the target tier — cycles back to the end
        // so it comes up again once its harder tier is in play.
        rest = [...rest, currentWordId];
      }
      // else: mastered — simply not re-added, so it leaves the queue.

      const answerRecord: SessionAnswer = {
        wordId: currentWordId,
        correct: input.correct,
        ms: input.ms,
        givenAnswer: input.givenAnswer,
        tier: tierAtAnswer,
      };
      const nextSession: SessionRecord = {
        ...session,
        queue: rest,
        answers: [...session.answers, answerRecord],
        currentIndex: session.currentIndex + 1,
        updatedAt: now,
        completedAt: rest.length === 0 ? now : undefined,
      };
      setSession(nextSession);
      await putSession(nextSession);
    },
    [session, currentWordId, progressByWordId, setId],
  );

  const dismissRoundSummary = useCallback(() => {
    setDismissedThroughAnswerCount(answersSoFar - (answersSoFar % ROUND_SIZE));
  }, [answersSoFar]);

  const restart = useCallback(async () => {
    initKey.current = '';
    await init();
  }, [init]);

  return {
    loading,
    error,
    session,
    batchWords,
    masteredCount: session ? batchWords.length - session.queue.length : 0,
    currentWord,
    currentTier,
    questionShape,
    distractorPool: poolExcludingCurrent,
    showRoundSummary,
    roundStats,
    isComplete,
    progressByWordId,
    answer,
    dismissRoundSummary,
    restart,
  };
}
