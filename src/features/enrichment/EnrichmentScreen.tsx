import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getAnthropicApiKey, getDeviceId, getSets, isEnrichmentEnabled, setAnthropicApiKey, setEnrichmentEnabled } from '@/db/meta';
import { putWordsBatch } from '@/db/words';
import { useAsync } from '@/hooks/useAsync';
import { applyEnrichmentSuggestion, findWordsNeedingEnrichment, planEnrichment, type EnrichmentPlanItem } from './enrichmentService';
import type { SetInfo, Word } from '@/types/domain';

/**
 * Auto-enrichment (§4): for imported words missing simple, examples, or
 * synonyms, batch-call the Anthropic API to fill the gaps. Shows a diff,
 * requires per-word approval, never silently overwrites an authored
 * entry. Off by default — the app is fully usable without ever visiting
 * this screen.
 */
export default function EnrichmentScreen() {
  const { data: sets } = useAsync(() => getSets(), []);
  const { data: initial } = useAsync(
    async () => ({ enabled: await isEnrichmentEnabled(), apiKey: (await getAnthropicApiKey()) ?? '' }),
    [],
  );

  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [setId, setSetId] = useState('');
  const [gaps, setGaps] = useState<Word[] | null>(null);
  const [plan, setPlan] = useState<EnrichmentPlanItem[] | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(0);

  useEffect(() => {
    if (initial) {
      setEnabled(initial.enabled);
      setApiKey(initial.apiKey);
    }
  }, [initial]);

  const activeSetId = setId || sets?.[0]?.id || '';

  async function toggleEnabled(next: boolean) {
    setEnabled(next);
    await setEnrichmentEnabled(next);
  }

  async function saveApiKey(next: string) {
    setApiKey(next);
    await setAnthropicApiKey(next);
  }

  async function scan() {
    setScanning(true);
    setPlan(null);
    setApplied(0);
    try {
      const words = await findWordsNeedingEnrichment(activeSetId);
      setGaps(words);
    } finally {
      setScanning(false);
    }
  }

  async function enrich() {
    if (!gaps || gaps.length === 0) return;
    setEnriching(true);
    setError(null);
    try {
      const result = await planEnrichment(apiKey, gaps);
      setPlan(result);
      setApproved(new Set()); // require fresh approval every time (§4)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnriching(false);
    }
  }

  function toggleApproved(wordId: string) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  }

  async function applyApproved() {
    if (!plan) return;
    const origin = await getDeviceId();
    const toWrite = plan.filter((item) => approved.has(item.word.id)).map((item) => applyEnrichmentSuggestion(item.word, item.suggestion, origin));
    if (toWrite.length > 0) await putWordsBatch(toWrite);
    setApplied(toWrite.length);
    setPlan(null);
    setGaps((prev) => prev?.filter((w) => !approved.has(w.id)) ?? null);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <h1 className="font-display uppercase text-lg">Enrichment</h1>

      <Card className="flex flex-col gap-3">
        <label className="flex items-center gap-2 font-body text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => void toggleEnabled(e.target.checked)} className="w-5 h-5 accent-black" />
          Enable auto-enrichment
        </label>
        <p className="font-body text-xs text-black/60">
          Off by default. When off, nothing on this screen calls any external service — the rest of Vocab Lab
          works exactly the same either way.
        </p>
        {enabled && (
          <label className="flex flex-col gap-1">
            <span className="font-display text-xs uppercase">Anthropic API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => void saveApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="press-surface px-3 py-2 font-body text-sm bg-[var(--paper)]"
            />
            <span className="font-body text-xs text-black/60">
              Stored only in this browser's local database. Sent directly to Anthropic — there's no backend.
            </span>
          </label>
        )}
      </Card>

      {enabled && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={activeSetId}
              onChange={(e) => {
                setSetId(e.target.value);
                setGaps(null);
                setPlan(null);
              }}
              className="press-surface px-3 py-2 font-body text-sm bg-[var(--paper)]"
            >
              {(sets ?? []).map((s: SetInfo) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button variant="yellow" disabled={scanning} onClick={() => void scan()}>
              {scanning ? 'Scanning…' : 'Scan for gaps'}
            </Button>
          </div>

          {gaps && (
            <p className="font-body text-sm">
              {gaps.length === 0
                ? 'No gaps found — every word in this set already has simple/examples/synonyms.'
                : `${gaps.length} word(s) missing at least one field.`}
            </p>
          )}

          {gaps && gaps.length > 0 && !plan && (
            <Button variant="violet" disabled={!apiKey || enriching} onClick={() => void enrich()}>
              {enriching ? 'Calling Claude…' : `Enrich ${gaps.length} word(s)`}
            </Button>
          )}

          {error && (
            <div className="surface p-3" style={{ background: 'var(--red)' }}>
              <p className="font-body text-sm">{error}</p>
            </div>
          )}

          {applied > 0 && (
            <div className="surface p-3" style={{ background: 'var(--lime)' }}>
              <p className="font-body text-sm">Applied {applied} word(s).</p>
            </div>
          )}
        </Card>
      )}

      {plan && plan.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {plan.map((item) => (
              <Card key={item.word.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-display uppercase text-sm">{item.word.term}</span>
                  <label className="flex items-center gap-2 font-body text-xs">
                    <input
                      type="checkbox"
                      checked={approved.has(item.word.id)}
                      onChange={() => toggleApproved(item.word.id)}
                      className="w-5 h-5 accent-black"
                    />
                    Approve
                  </label>
                </div>
                {item.suggestion.simple && !item.word.simple && (
                  <p className="font-body text-sm">
                    <strong>+ simple:</strong> {item.suggestion.simple}
                  </p>
                )}
                {item.suggestion.examples && item.word.examples.length === 0 && (
                  <p className="font-body text-sm">
                    <strong>+ examples:</strong> {item.suggestion.examples.join(' / ')}
                  </p>
                )}
                {item.suggestion.synonyms && item.word.synonyms.length === 0 && (
                  <p className="font-body text-sm">
                    <strong>+ synonyms:</strong> {item.suggestion.synonyms.join(', ')}
                  </p>
                )}
                {item.fromCache && <p className="font-body text-xs text-black/50">(from cache)</p>}
              </Card>
            ))}
          </div>
          <Button variant="lime" disabled={approved.size === 0} onClick={() => void applyApproved()}>
            Apply {approved.size} approved change(s)
          </Button>
        </>
      )}
    </div>
  );
}
