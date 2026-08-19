import { lazy } from 'react';
import { createBrowserRouter, useParams } from 'react-router-dom';
import { AppShell } from '@/components/shell/AppShell';

// Every study mode is its own lazy route (§2 bundle budget) — none of
// these are pulled into the initial chunk.
const HomeScreen = lazy(() => import('@/features/home/HomeScreen'));
const FlashcardsMode = lazy(() => import('@/modes/flashcards/FlashcardsMode'));
const WriteMode = lazy(() => import('@/modes/write/WriteMode'));
const LearnMode = lazy(() => import('@/modes/learn/LearnMode'));
const TestMode = lazy(() => import('@/modes/test/TestMode'));
const MatchMode = lazy(() => import('@/modes/match/MatchMode'));
const BrowseScreen = lazy(() => import('@/features/browse/BrowseScreen'));
const StatsScreen = lazy(() => import('@/features/stats/StatsScreen'));
const StudyGuideScreen = lazy(() => import('@/features/studyGuide/StudyGuideScreen'));

const MODE_COMPONENTS = {
  flashcards: FlashcardsMode,
  write: WriteMode,
  learn: LearnMode,
  test: TestMode,
  match: MatchMode,
} as const;

type StudyModeParam = keyof typeof MODE_COMPONENTS;

function isStudyMode(mode: string | undefined): mode is StudyModeParam {
  return !!mode && mode in MODE_COMPONENTS;
}

/** Single dynamic route for /study/:setId/:mode — dispatches to the right
 * lazy mode component instead of one route entry per mode, so adding a
 * mode never means touching the router. */
function StudyModeRoute() {
  const { mode } = useParams<{ setId: string; mode: string }>();
  if (!isStudyMode(mode)) {
    return (
      <div className="p-6 font-body text-sm">
        Unknown study mode "{mode}".
      </div>
    );
  }
  const Mode = MODE_COMPONENTS[mode];
  return <Mode />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'study/:setId/:mode', element: <StudyModeRoute /> },
      { path: 'browse', element: <BrowseScreen /> },
      { path: 'stats', element: <StatsScreen /> },
      { path: 'study-guide', element: <StudyGuideScreen /> },
    ],
  },
]);
