import { useCallback, useEffect, useRef, useState } from 'react';
import { getDeviceId } from '@/db/meta';
import { getDueWordIds, getProgressByIds, initialProgress, putProgress } from '@/db/progress';
import { getActiveSession, putSession } from '@/db/sessions';
import { getWordsByIds, getWordsBySetPage } from '@/db/words';
import { applyAnswer } from '@/lib/scheduler';
import { makeSessionSeed, mulberry32, shuffle } from '@/lib/prng';
import { MAX_SESSION_QUEUE } from '@/lib/session';
import type { ProgressRecord, SessionAnswer, SessionRecord, StudyMode, Word } from '@/types/domain';

export interface SubmitAnswerInput {
  correct: boolean;
  ms: number;
  distractorId?: string;
  givenAnswer?: string;
  /** Learn/Test may not want a miss to demote the schedule (§3 Test: "do
   * not touch spaced-repetition state unless the user opts in"). Defaults
   * to true. */
  affectsSchedule?: boolean;
}

export interface UseSessionResult {
  loading: boolean;
  error: Error | undefined;
  session: SessionRecord | undefined;
  /** Loaded Word records, in session.queue order. */
  words: Word[];
  currentIndex: number;
  currentWord: Word | undefined;
  currentProgress: ProgressRecord | undefined;
  progressByWordId: Map<string, ProgressRecord>;
  isComplete: boolean;
  goTo: (index: number) => void;
  advance: (delta: number) => void;
  submitAnswer: (input: SubmitAnswerInput) => Promise<void>;
  toggleStar: (wordId: string) => Promise<void>;
  restart: () => Promise<void>;
}

/**
 * The session runner (§10.5) every study mode is built on. A session pulls
 * at most 20 due words (falling back to a plain review of the set if
 * nothing is due, so a mode is never a dead end), shuffles them with a
 * seeded PRNG (stored on the record for exact replay, §2), and persists
 * queue/currentIndex/answers to the `sessions` store after every answer —
 * killing the tab and reopening resumes exactly where it left off.
 */
export function useSession(setId: string, mode: StudyMode): UseSessionResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [session, setSession] = useState<SessionRecord>();
  const [words, setWords] = useState<Word[]>([]);
  const [progressByWordId, setProgressByWordId] = useState<Map<string, ProgressRecord>>(new Map());
  const initKey = useRef<string>('');

  const init = useCallback(async () => {
    try {
      setLoading(true);
      setError(undefined);
      const origin = await getDeviceId();
      const now = Date.now();

      let active = await getActiveSession();
      if (active && (active.mode !== mode || active.setIds[0] !== setId)) {
        active = undefined; // a different in-flight session — don't hijack it
      }

      let s: SessionRecord;
      if (active) {
        s = active;
      } else {
        let dueIds = await getDueWordIds(setId, now, MAX_SESSION_QUEUE);
        if (dueIds.length === 0) {
          const page = await getWordsBySetPage(setId, { limit: MAX_SESSION_QUEUE });
          dueIds = page.items.map((w) => w.id);
        }
        const seed = makeSessionSeed();
        const queue = shuffle(dueIds, mulberry32(seed));
        s = {
          id: crypto.randomUUID(),
          mode,
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

      const [loadedWords, progressMap] = await Promise.all([getWordsByIds(s.queue), getProgressByIds(s.queue)]);
      for (const w of loadedWords) {
        if (!progressMap.has(w.id)) {
          const p = initialProgress(w.id, w.setId, now, origin);
          progressMap.set(w.id, p);
          await putProgress(p);
        }
      }

      setSession(s);
      const byId = new Map(loadedWords.map((w) => [w.id, w]));
      setWords(s.queue.map((id) => byId.get(id)).filter((w): w is Word => !!w));
      setProgressByWordId(progressMap);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [setId, mode]);

  useEffect(() => {
    const key = `${setId}:${mode}`;
    if (initKey.current === key) return;
    initKey.current = key;
    void init();
  }, [setId, mode, init]);

  const persist = useCallback(async (next: SessionRecord) => {
    setSession(next);
    await putSession(next);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (!session) return;
      const clamped = Math.max(0, Math.min(index, session.queue.length - 1));
      void persist({ ...session, currentIndex: clamped, updatedAt: Date.now() });
    },
    [session, persist],
  );

  const advance = useCallback(
    (delta: number) => {
      if (!session) return;
      goTo(session.currentIndex + delta);
    },
    [session, goTo],
  );

  const submitAnswer = useCallback(
    async (input: SubmitAnswerInput) => {
      if (!session) return;
      const word = words[session.currentIndex];
      if (!word) return;
      const origin = await getDeviceId();
      const now = Date.now();
      const progress = progressByWordId.get(word.id) ?? initialProgress(word.id, word.setId, now, origin);

      if (input.affectsSchedule ?? true) {
        const nextProgress = applyAnswer(progress, {
          correct: input.correct,
          now,
          ms: input.ms,
          distractorId: input.distractorId,
          origin,
        });
        await putProgress(nextProgress);
        setProgressByWordId((m) => new Map(m).set(word.id, nextProgress));
      }

      const answer: SessionAnswer = {
        wordId: word.id,
        correct: input.correct,
        ms: input.ms,
        givenAnswer: input.givenAnswer,
        tier: progress.tier,
      };
      const nextIndex = session.currentIndex + 1;
      const nextSession: SessionRecord = {
        ...session,
        answers: [...session.answers, answer],
        currentIndex: nextIndex,
        updatedAt: now,
        completedAt: nextIndex >= session.queue.length ? now : undefined,
      };
      await persist(nextSession);
    },
    [session, words, progressByWordId, persist],
  );

  const toggleStar = useCallback(
    async (wordId: string) => {
      const now = Date.now();
      const origin = await getDeviceId();
      const existing = progressByWordId.get(wordId);
      const setIdForWord = words.find((w) => w.id === wordId)?.setId ?? setId;
      const base = existing ?? initialProgress(wordId, setIdForWord, now, origin);
      const next: ProgressRecord = { ...base, starred: !base.starred, updatedAt: now, origin };
      await putProgress(next);
      setProgressByWordId((m) => new Map(m).set(wordId, next));
    },
    [progressByWordId, words, setId],
  );

  const restart = useCallback(async () => {
    initKey.current = '';
    await init();
  }, [init]);

  const currentWord = session ? words[session.currentIndex] : undefined;
  const currentProgress = currentWord ? progressByWordId.get(currentWord.id) : undefined;
  const isComplete = session ? session.currentIndex >= session.queue.length && session.queue.length > 0 : false;

  return {
    loading,
    error,
    session,
    words,
    currentIndex: session?.currentIndex ?? 0,
    currentWord,
    currentProgress,
    progressByWordId,
    isComplete,
    goTo,
    advance,
    submitAnswer,
    toggleStar,
    restart,
  };
}
