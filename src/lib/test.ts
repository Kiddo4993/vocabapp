// Pure question-building and grading logic for Test mode (§3), kept out of
// the component so it's easy to reason about independently: nothing here
// touches the DB or the scheduler — TestMode.tsx applies the scheduler
// separately, and only if the user opted in.

import { isCloseEnough } from './levenshtein';
import { pickDistractors } from './session';
import { shuffle, type RNG } from './prng';
import type { Word } from '@/types/domain';

export type TestQuestionType = 'written' | 'multiple-choice' | 'true-false' | 'matching';

export interface TestTypeConfig {
  written: boolean;
  multipleChoice: boolean;
  trueFalse: boolean;
  matching: boolean;
}

export interface WrittenQuestion {
  id: string;
  type: 'written';
  word: Word;
}
export interface MultipleChoiceTestQuestion {
  id: string;
  type: 'multiple-choice';
  word: Word;
  options: Word[];
  correctIndex: number;
}
export interface TrueFalseQuestion {
  id: string;
  type: 'true-false';
  word: Word;
  shownDefinition: string;
  isActuallyTrue: boolean;
}
export interface MatchingQuestion {
  id: string;
  type: 'matching';
  words: Word[];
  /** Definitions to display, already shuffled relative to `words`. */
  shuffledDefinitionOrder: string[]; // word ids, in the order their definitions should render
}

export type TestQuestion = WrittenQuestion | MultipleChoiceTestQuestion | TrueFalseQuestion | MatchingQuestion;

export interface WrittenAnswer {
  type: 'written';
  guess: string;
}
export interface MultipleChoiceAnswer {
  type: 'multiple-choice';
  selectedIndex: number;
}
export interface TrueFalseAnswer {
  type: 'true-false';
  guess: boolean;
}
export interface MatchingAnswer {
  type: 'matching';
  /** wordId (the term shown) -> wordId whose definition was assigned to it. */
  pairs: Record<string, string>;
}
export type TestAnswer = WrittenAnswer | MultipleChoiceAnswer | TrueFalseAnswer | MatchingAnswer | undefined;

function enabledTypes(config: TestTypeConfig): TestQuestionType[] {
  const out: TestQuestionType[] = [];
  if (config.written) out.push('written');
  if (config.multipleChoice) out.push('multiple-choice');
  if (config.trueFalse) out.push('true-false');
  if (config.matching) out.push('matching');
  return out;
}

/** Builds `questionCount` questions from `words`, distributing them across
 * whichever types are enabled, drawing distractors from `pool`. Matching
 * questions consume up to 4 words at once, so they count as one question
 * but use several words from the pool. */
export function buildTestQuestions(
  words: Word[],
  pool: Word[],
  questionCount: number,
  config: TestTypeConfig,
  rng: RNG,
): TestQuestion[] {
  const types = enabledTypes(config);
  if (types.length === 0 || words.length === 0) return [];

  const shuffledWords = shuffle(words, rng);
  const questions: TestQuestion[] = [];
  let cursor = 0;

  for (let i = 0; i < questionCount && cursor < shuffledWords.length; i++) {
    const type = types[i % types.length];

    if (type === 'matching') {
      const chunkSize = Math.min(4, shuffledWords.length - cursor);
      if (chunkSize < 2) continue; // not enough words left for a matching question
      const chunk = shuffledWords.slice(cursor, cursor + chunkSize);
      cursor += chunkSize;
      questions.push({
        id: `match-${questions.length}`,
        type: 'matching',
        words: chunk,
        shuffledDefinitionOrder: shuffle(chunk, rng).map((w) => w.id),
      });
      continue;
    }

    const word = shuffledWords[cursor];
    cursor++;

    if (type === 'written') {
      questions.push({ id: `w-${questions.length}`, type: 'written', word });
    } else if (type === 'multiple-choice') {
      const distractors = pickDistractors(pool, word.id, 3, rng);
      const options = shuffle([word, ...distractors], rng);
      questions.push({
        id: `mc-${questions.length}`,
        type: 'multiple-choice',
        word,
        options,
        correctIndex: options.findIndex((o) => o.id === word.id),
      });
    } else {
      const isActuallyTrue = rng() < 0.5;
      const shownWord = isActuallyTrue ? word : pickDistractors(pool, word.id, 1, rng)[0];
      questions.push({
        id: `tf-${questions.length}`,
        type: 'true-false',
        word,
        shownDefinition: (shownWord ?? word).definition,
        isActuallyTrue: !shownWord || shownWord.id === word.id,
      });
    }
  }

  return questions;
}

export function gradeQuestion(question: TestQuestion, answer: TestAnswer): boolean {
  if (!answer) return false;
  switch (question.type) {
    case 'written':
      return (
        answer.type === 'written' &&
        (isCloseEnough(answer.guess, question.word.term) ||
          question.word.aliases.some((a) => a.toLowerCase() === answer.guess.trim().toLowerCase()))
      );
    case 'multiple-choice':
      return answer.type === 'multiple-choice' && answer.selectedIndex === question.correctIndex;
    case 'true-false':
      return answer.type === 'true-false' && answer.guess === question.isActuallyTrue;
    case 'matching':
      return (
        answer.type === 'matching' &&
        question.words.every((w) => answer.pairs[w.id] === w.id)
      );
    default:
      return false;
  }
}

/** All word ids a question is "about", for the retake-missed pool. */
export function questionWordIds(question: TestQuestion): string[] {
  return question.type === 'matching' ? question.words.map((w) => w.id) : [question.word.id];
}
