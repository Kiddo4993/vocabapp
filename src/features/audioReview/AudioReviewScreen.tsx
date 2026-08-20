import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getSets } from '@/db/meta';
import { getWordsBySetPage } from '@/db/words';
import { useAsync } from '@/hooks/useAsync';
import type { SetInfo, Word } from '@/types/domain';

const PAUSE_MS = 1200;

function speakAndWait(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function wait(ms: number, aborted: { current: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (aborted.current || Date.now() - start >= ms) {
        resolve();
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

/**
 * Audio review (§4/§10.10): queue a set, play term -> pause -> definition
 * -> pause through Web Speech, hands-free. Optional — nothing here is
 * ever called unless the user opens this screen and presses play.
 */
export default function AudioReviewScreen() {
  const { data: sets } = useAsync(() => getSets(), []);
  const [setId, setSetId] = useState('');
  const activeSetId = setId || sets?.[0]?.id || '';
  const { data: words } = useAsync(
    async (): Promise<Word[]> => (activeSetId ? (await getWordsBySetPage(activeSetId, { limit: 500 })).items : []),
    [activeSetId],
  );

  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const abortedRef = useRef({ current: false });

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  async function play() {
    if (!words || words.length === 0) return;
    abortedRef.current = { current: false };
    const aborted = abortedRef.current;
    setPlaying(true);

    let i = index >= words.length ? 0 : index;
    for (; i < words.length && !aborted.current; i++) {
      setIndex(i);
      const w = words[i];
      await speakAndWait(w.term);
      if (aborted.current) break;
      await wait(PAUSE_MS, aborted);
      if (aborted.current) break;
      await speakAndWait(w.definition);
      if (aborted.current) break;
      await wait(PAUSE_MS, aborted);
    }

    if (!aborted.current) {
      setIndex(0);
    }
    setPlaying(false);
  }

  function stop() {
    abortedRef.current.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
  }

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <h1 className="font-display uppercase text-lg">Audio review</h1>

      {!supported && (
        <Card style={{ background: 'var(--red)' }}>
          <p className="font-body text-sm">Text-to-speech isn't available in this browser.</p>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <select
          value={activeSetId}
          onChange={(e) => {
            stop();
            setSetId(e.target.value);
            setIndex(0);
          }}
          className="press-surface px-3 py-2 font-body text-sm bg-[var(--paper)]"
        >
          {(sets ?? []).map((s: SetInfo) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <Button variant="lime" disabled={!supported || playing || !words?.length} onClick={() => void play()}>
            {playing ? 'Playing…' : 'Play'}
          </Button>
          <Button variant="paper" disabled={!playing} onClick={stop}>
            Stop
          </Button>
        </div>

        {words && words.length > 0 && (
          <p className="font-body text-sm">
            {playing ? 'Now playing' : 'Up next'}: <strong>{words[Math.min(index, words.length - 1)]?.term}</strong>{' '}
            ({index + 1} / {words.length})
          </p>
        )}
      </Card>
    </div>
  );
}
