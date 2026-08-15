import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SessionBar } from '@/components/shell/SessionBar';
import { SessionComplete } from '@/components/session/SessionComplete';
import { Button } from '@/components/ui/Button';
import { BoxChip } from '@/components/ui/BoxChip';
import { useSession } from '@/hooks/useSession';
import { useSpeech } from '@/hooks/useSpeech';
import { mulberry32, shuffle } from '@/lib/prng';

type Direction = 'term-first' | 'def-first';

const AUTOPLAY_INTERVALS = [
  { label: '2s', ms: 2000 },
  { label: '4s', ms: 4000 },
  { label: '6s', ms: 6000 },
];

/**
 * Flashcards (§3): flip on click/space, arrow keys or swipe to move,
 * star/unstar, shuffle, autoplay with adjustable interval, TTS on the
 * term, and a switchable term<->definition direction. Doesn't touch the
 * scheduler — it's a browsing mode, not a graded one.
 */
export default function FlashcardsMode() {
  const { setId = '' } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const { loading, error, session, words, currentIndex, currentWord, currentProgress, isComplete, advance, toggleStar, restart } =
    useSession(setId, 'flashcards');
  const { speak } = useSpeech();

  const [flipped, setFlipped] = useState(false);
  const [direction, setDirection] = useState<Direction>('term-first');
  const [autoplay, setAutoplay] = useState(false);
  const [intervalMs, setIntervalMs] = useState(4000);
  const [order, setOrder] = useState<number[] | null>(null); // shuffle override, indexes into words

  const flippedRef = useRef(flipped);
  flippedRef.current = flipped;
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setFlipped(false);
  }, [currentIndex]);

  const flip = useCallback(() => setFlipped((f) => !f), []);

  const goRelative = useCallback(
    (delta: number) => {
      advance(delta);
    },
    [advance],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        flip();
      } else if (e.key === 'ArrowRight') {
        goRelative(1);
      } else if (e.key === 'ArrowLeft') {
        goRelative(-1);
      } else if (e.key.toLowerCase() === 's') {
        if (currentWord) void toggleStar(currentWord.id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flip, goRelative, currentWord, toggleStar]);

  // Autoplay: show term, wait, flip to definition, wait, advance.
  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      if (!flippedRef.current) {
        setFlipped(true);
      } else {
        setFlipped(false);
        goRelative(1);
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [autoplay, intervalMs, goRelative]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    goRelative(dx < 0 ? 1 : -1);
  }

  function handleShuffle() {
    if (order) {
      setOrder(null); // toggle back to original order
      return;
    }
    const rng = mulberry32(session?.seed ? session.seed + 1 : Date.now());
    setOrder(shuffle(words.map((_, i) => i), rng));
  }

  if (loading) return <div className="p-6 font-body text-sm">Loading…</div>;
  if (error) return <div className="p-6 font-body text-sm">Couldn't load this set: {error.message}</div>;
  if (!session || words.length === 0) {
    return <div className="p-6 font-body text-sm">Nothing to study in this set yet.</div>;
  }
  if (isComplete) {
    return <SessionComplete total={words.length} onRestart={restart} />;
  }

  const displayIndex = order ? order[currentIndex] : currentIndex;
  const word = order ? words[displayIndex] : currentWord;
  if (!word) return null;

  const front = direction === 'term-first' ? word.term : word.definition;
  const back = direction === 'term-first' ? word.definition : word.term;
  const showingTerm = (direction === 'term-first') !== flipped;

  return (
    <div className="flex flex-col h-full">
      <SessionBar modeLabel="Flashcards" current={currentIndex} total={words.length} onExit={() => navigate('/')} />

      <div className="flex-1 flex flex-col items-center gap-4 p-4 sm:p-6">
        <div className="w-full max-w-md flex items-center justify-between">
          {currentProgress && <BoxChip box={currentProgress.box} />}
          <button
            type="button"
            onClick={() => currentWord && toggleStar(currentWord.id)}
            aria-pressed={currentProgress?.starred ?? false}
            aria-label={currentProgress?.starred ? 'Unstar this word' : 'Star this word'}
            className="press-surface px-3 py-1.5 font-display text-xs uppercase"
            style={{ background: currentProgress?.starred ? 'var(--yellow)' : 'var(--paper)' }}
          >
            {currentProgress?.starred ? '★ Starred' : '☆ Star'}
          </button>
        </div>

        <button
          type="button"
          onClick={flip}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="press-surface w-full max-w-md min-h-[280px] bg-[var(--paper)] flex flex-col items-center justify-center gap-3 p-8 text-center focus-visible:outline focus-visible:outline-[4px] focus-visible:outline-black"
          aria-label={flipped ? 'Showing answer, press space or click to flip back' : 'Press space or click to flip'}
        >
          {word.pos && showingTerm && (
            <span className="font-body text-xs uppercase text-black/60">{word.pos}</span>
          )}
          <span className="font-display uppercase text-2xl sm:text-3xl tracking-tight">{flipped ? back : front}</span>
          {showingTerm && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                speak(word.term);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  speak(word.term);
                }
              }}
              className="press-surface mt-2 px-3 py-1 font-display text-xs uppercase bg-[var(--cyan)]"
              aria-label="Play pronunciation"
            >
              🔊 Listen
            </span>
          )}
        </button>

        <div className="w-full max-w-md flex items-center justify-between gap-2">
          <Button variant="paper" onClick={() => goRelative(-1)} aria-label="Previous card">
            ← Prev
          </Button>
          <Button variant="paper" onClick={() => goRelative(1)} aria-label="Next card">
            Next →
          </Button>
        </div>

        <div className="w-full max-w-md flex flex-wrap items-center gap-2 justify-center">
          <Button
            variant={direction === 'term-first' ? 'violet' : 'paper'}
            onClick={() => setDirection((d) => (d === 'term-first' ? 'def-first' : 'term-first'))}
          >
            {direction === 'term-first' ? 'Term → Definition' : 'Definition → Term'}
          </Button>
          <Button variant={order ? 'violet' : 'paper'} onClick={handleShuffle}>
            Shuffle
          </Button>
          <Button variant={autoplay ? 'violet' : 'paper'} onClick={() => setAutoplay((a) => !a)}>
            {autoplay ? 'Stop autoplay' : 'Autoplay'}
          </Button>
          {AUTOPLAY_INTERVALS.map((opt) => (
            <button
              key={opt.ms}
              onClick={() => setIntervalMs(opt.ms)}
              className="press-surface px-3 py-1.5 font-display text-xs uppercase"
              style={{ background: intervalMs === opt.ms ? 'var(--lime)' : 'var(--paper)' }}
              aria-pressed={intervalMs === opt.ms}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="font-body text-xs text-black/60 text-center max-w-md">
          Space or click to flip · ← → to move · S to star
        </p>
      </div>
    </div>
  );
}
