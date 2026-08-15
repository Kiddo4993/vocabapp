import { useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

/** Small, dependency-free async-effect hook: runs `fn` on mount and
 * whenever `deps` changes, ignoring results from a stale run that resolves
 * after a newer one started. Used throughout the UI for the "load a page
 * of IndexedDB data" pattern instead of hand-rolling the same
 * cancelled-effect boilerplate at every call site. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, loading: true, error: undefined });
  const nonce = useRef(0);

  useEffect(() => {
    const id = ++nonce.current;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => {
        if (nonce.current === id) setState({ data, loading: false, error: undefined });
      },
      (error: unknown) => {
        if (nonce.current === id) {
          setState({ data: undefined, loading: false, error: error instanceof Error ? error : new Error(String(error)) });
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: () => setState((s) => ({ ...s })) };
}
