import { useCallback } from 'react';

/** Thin Web Speech API wrapper (§3 Flashcards TTS, §4 audio review). Safe
 * to call in environments without speech synthesis — becomes a no-op. */
export function useSpeech() {
  const speak = useCallback((text: string, opts?: { rate?: number }) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (opts?.rate) utterance.rate = opts.rate;
    window.speechSynthesis.speak(utterance);
  }, []);

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return { speak, cancel, supported };
}
