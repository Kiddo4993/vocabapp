import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { exportBackup, importMergeBackup, type BackupFile, type ImportMergeResult } from './backupService';

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Backup (§4): one-click export of the whole database, and import-merge
 * back through the last-write-wins merge function (src/lib/merge.ts). */
export default function BackupScreen() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportMergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const backup = await exportBackup();
      const filename = `vocab-lab-backup-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`;
      download(filename, JSON.stringify(backup, null, 2));
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupFile;
      if (!Array.isArray(parsed.words) || !Array.isArray(parsed.progress)) {
        throw new Error('This does not look like a Vocab Lab backup file.');
      }
      const mergeResult = await importMergeBackup(parsed);
      setResult(mergeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <h1 className="font-display uppercase text-lg">Backup</h1>

      <Card className="flex flex-col gap-3">
        <p className="font-display text-xs uppercase">Export</p>
        <p className="font-body text-sm">
          Download the entire database — every word, all your progress, and session history — as one JSON file.
        </p>
        <Button variant="lime" disabled={exporting} onClick={() => void handleExport()}>
          {exporting ? 'Exporting…' : 'Export backup'}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="font-display text-xs uppercase">Import &amp; merge</p>
        <p className="font-body text-sm">
          Merges a backup file into what's already here — last-write-wins per record, nothing is silently
          overwritten or lost. Safe to import your own most recent export; it's a no-op.
        </p>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={(e) => void handleFileChosen(e)} className="hidden" />
        <Button variant="cyan" disabled={importing} onClick={() => fileInputRef.current?.click()}>
          {importing ? 'Merging…' : 'Choose backup file…'}
        </Button>

        {error && (
          <div className="surface p-3" style={{ background: 'var(--red)' }}>
            <p className="font-body text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div className="surface p-3" style={{ background: 'var(--lime)' }}>
            <p className="font-body text-sm">
              Merged: {result.wordsWritten} word{result.wordsWritten === 1 ? '' : 's'}, {result.progressWritten}{' '}
              progress record{result.progressWritten === 1 ? '' : 's'}, {result.sessionsWritten} session
              {result.sessionsWritten === 1 ? '' : 's'}, {result.setsWritten} set{result.setsWritten === 1 ? '' : 's'}{' '}
              changed.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
