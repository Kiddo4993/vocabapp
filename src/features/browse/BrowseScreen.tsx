import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BoxChip } from '@/components/ui/BoxChip';
import { getSets } from '@/db/meta';
import { getProgressByIds } from '@/db/progress';
import { countAllWords, countWordsInSet, getWordsBySetPage, getWordsByIds, getWordsPage } from '@/db/words';
import { useAsync } from '@/hooks/useAsync';
import { useWorkerRequest } from '@/hooks/useWorker';
import type { ProgressRecord, SetInfo, Word } from '@/types/domain';

const PAGE_SIZE = 200;
const SEARCH_DEBOUNCE_MS = 150;
const ROW_HEIGHT = 96;

type Cursor = string | [string, string] | undefined;

/**
 * Browse (§2, §10.7): @tanstack/react-virtual over a windowed cursor
 * query. The full id list is never materialised to feed the virtualiser —
 * it's given a bounded index count and pages 200 words at a time off an
 * IndexedDB cursor as the visible window approaches the loaded edge.
 * Search runs through the worker's inverted index (debounced 150ms)
 * instead of the cursor pager, since a search result set is already small
 * and bounded.
 */
export default function BrowseScreen() {
  const { data: sets } = useAsync(() => getSets(), []);
  const { request } = useWorkerRequest();

  const [setId, setSetId] = useState<string>('all');
  const [queryInput, setQueryInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [items, setItems] = useState<Word[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextAfter, setNextAfter] = useState<Cursor>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [progressByWordId, setProgressByWordId] = useState<Map<string, ProgressRecord>>(new Map());
  const [mode, setMode] = useState<'browse' | 'search'>('browse');

  const parentRef = useRef<HTMLDivElement>(null);

  // Debounce the search box (§2: "Debounce 150 ms").
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(queryInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [queryInput]);

  const mergeProgress = useCallback(async (words: Word[]) => {
    if (words.length === 0) return;
    const map = await getProgressByIds(words.map((w) => w.id));
    setProgressByWordId((prev) => {
      const next = new Map(prev);
      for (const [id, p] of map) next.set(id, p);
      return next;
    });
  }, []);

  // (Re)load when the set filter or the debounced query changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (debouncedQuery) {
        setMode('search');
        const res = await request({ type: 'search:query', payload: { query: debouncedQuery, limit: 100 } });
        if (cancelled || res.type !== 'search:results') return;
        let words = await getWordsByIds(res.payload.ids);
        if (setId !== 'all') words = words.filter((w) => w.setId === setId);
        // Preserve search relevance order (getWordsByIds doesn't).
        const order = new Map(res.payload.ids.map((id, i) => [id, i]));
        words.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        setItems(words);
        setTotalCount(words.length);
        setNextAfter(undefined);
        void mergeProgress(words);
        return;
      }

      setMode('browse');
      const [page, count] = await Promise.all([
        setId === 'all' ? getWordsPage({ limit: PAGE_SIZE }) : getWordsBySetPage(setId, { limit: PAGE_SIZE }),
        setId === 'all' ? countAllWords() : countWordsInSet(setId),
      ]);
      if (cancelled) return;
      setItems(page.items);
      setTotalCount(count);
      setNextAfter(page.nextAfter);
      void mergeProgress(page.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, debouncedQuery, request, mergeProgress]);

  const loadMore = useCallback(async () => {
    if (mode !== 'browse' || loadingMore || nextAfter === undefined) return;
    setLoadingMore(true);
    const page =
      setId === 'all'
        ? await getWordsPage({ after: nextAfter as string, limit: PAGE_SIZE })
        : await getWordsBySetPage(setId, { after: nextAfter as [string, string], limit: PAGE_SIZE });
    setItems((prev) => [...prev, ...page.items]);
    setNextAfter(page.nextAfter);
    void mergeProgress(page.items);
    setLoadingMore(false);
  }, [mode, loadingMore, nextAfter, setId, mergeProgress]);

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= items.length - 20) {
      void loadMore();
    }
  }, [virtualItems, items.length, loadMore]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b-[4px] border-black bg-[var(--paper)] px-4 sm:px-6 py-3 flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="search"
          placeholder="Search terms and definitions…"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          className="press-surface flex-1 px-4 py-2 font-body bg-[var(--paper)]"
          aria-label="Search"
        />
        <select
          value={setId}
          onChange={(e) => setSetId(e.target.value)}
          className="press-surface px-3 py-2 font-body text-sm bg-[var(--paper)]"
          aria-label="Filter by set"
        >
          <option value="all">All sets</option>
          {(sets ?? []).map((s: SetInfo) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="font-body text-xs text-black/60 whitespace-nowrap">{totalCount} words</span>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto p-4 sm:p-6">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualItems.map((virtualRow) => {
            const word = items[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: 8,
                }}
              >
                {word ? (
                  <BrowseRow word={word} progress={progressByWordId.get(word.id)} showSet={setId === 'all'} sets={sets} />
                ) : (
                  <div className="surface h-full flex items-center px-4 font-body text-xs text-black/40">Loading…</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BrowseRow({
  word,
  progress,
  showSet,
  sets,
}: {
  word: Word;
  progress: ProgressRecord | undefined;
  showSet: boolean;
  sets: SetInfo[] | undefined;
}) {
  const setName = showSet ? sets?.find((s) => s.id === word.setId)?.name : undefined;
  return (
    <div className="surface h-full px-4 py-3 flex items-center gap-3">
      {progress && <BoxChip box={progress.box} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-display uppercase text-sm">{word.term}</span>
          {word.pos && <span className="font-body text-xs text-black/50">{word.pos}</span>}
          {setName && <span className="font-body text-xs text-black/40">· {setName}</span>}
        </div>
        <p className="font-body text-sm truncate text-black/80">{word.definition}</p>
      </div>
      {progress?.starred && <span aria-label="Starred">★</span>}
    </div>
  );
}
