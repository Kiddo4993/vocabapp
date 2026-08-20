import { useState } from 'react';
import { getDeviceId } from '@/db/meta';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useWorkerRequest } from '@/hooks/useWorker';
import { slugify } from '@/lib/parse';

interface ImportOutcome {
  written: number;
  skipped: number;
  reviewLines: number;
}

/**
 * In-app Import screen (§2/§6) — the third of the parser's three call
 * sites (CLI, worker, here). Streamed/batched/resumable/delta import all
 * happen in the worker (src/worker/importWorker.ts); this screen just
 * feeds it text and renders the live progress it reports back.
 */
export default function ImportScreen() {
  const { request } = useWorkerRequest();
  const [setName, setSetName] = useState('');
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startImport() {
    if (!setName.trim() || !text.trim()) return;
    setImporting(true);
    setProgress(null);
    setOutcome(null);
    setError(null);

    try {
      const origin = await getDeviceId();
      const setId = slugify(setName);
      // Stable per (set, content) so retrying the same file resumes
      // rather than restarting or double-writing (§2).
      const jobId = `${setId}:${text.length}:${text.slice(0, 64)}`;

      const response = await request(
        {
          type: 'import:start',
          payload: { jobId, setId, setName: setName.trim(), text, origin },
        },
        (progressResponse) => {
          if (progressResponse.type === 'import:progress') {
            setProgress(progressResponse.payload);
          }
        },
      );

      if (response.type === 'import:done') {
        setOutcome(response.payload);
      } else if (response.type === 'error') {
        setError(response.payload.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <h1 className="font-display uppercase text-lg">Import</h1>

      <Card className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-display text-xs uppercase">Set name</span>
          <input
            type="text"
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
            disabled={importing}
            className="press-surface px-3 py-2 font-body text-sm bg-[var(--paper)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-xs uppercase">
            Raw word list (headword-then-gloss, <code>word (pos) - meaning</code>, or numbered senses — one of
            each per line)
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={importing}
            rows={10}
            className="press-surface px-3 py-2 font-body text-sm bg-[var(--paper)]"
            data-testid="import-textarea"
          />
        </label>
        <Button variant="yellow" disabled={importing || !setName.trim() || !text.trim()} onClick={() => void startImport()}>
          {importing ? 'Importing…' : 'Import'}
        </Button>

        {progress && (
          <div
            className="h-4 border-[3px] border-black bg-[var(--paper)]"
            role="progressbar"
            aria-valuenow={progress.processed}
            aria-valuemax={progress.total}
            data-testid="import-progress"
            data-processed={progress.processed}
            data-total={progress.total}
          >
            <div className="h-full bg-[var(--ink)]" style={{ width: `${pct}%` }} />
          </div>
        )}

        {error && (
          <div className="surface p-3" style={{ background: 'var(--red)' }}>
            <p className="font-body text-sm">{error}</p>
          </div>
        )}

        {outcome && (
          <div className="surface p-3" style={{ background: 'var(--lime)' }} data-testid="import-outcome">
            <p className="font-body text-sm" data-written={outcome.written} data-skipped={outcome.skipped}>
              Written: {outcome.written} · Unchanged (skipped): {outcome.skipped} · Sent to review:{' '}
              {outcome.reviewLines}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
