import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getSets } from '@/db/meta';
import { getAllProgressForSet } from '@/db/progress';
import { getWordsBySetPage } from '@/db/words';
import { useAsync } from '@/hooks/useAsync';
import { computeConfusionPairs } from '@/lib/confusion';
import { generateStudyGuideHtml, generateStudyGuideMarkdown, type StudyGuideInput } from '@/lib/studyGuide';
import type { SetInfo } from '@/types/domain';

const GUIDE_WORD_LIMIT = 500;

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Study guide generator (§4/§10.8): pick sets, get a guide with words
 * grouped by theme, confusion pairs called out, and a quick-reference
 * table — exportable as Markdown or print-friendly HTML. */
export default function StudyGuideScreen() {
  const { data: sets } = useAsync(() => getSets(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [guide, setGuide] = useState<StudyGuideInput | null>(null);
  const [generating, setGenerating] = useState(false);

  const selectedList = useMemo(() => [...selected], [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    if (!sets) return;
    setGenerating(true);
    try {
      const chosen = sets.filter((s) => selected.has(s.id));
      const guideSets = await Promise.all(
        chosen.map(async (s) => {
          const page = await getWordsBySetPage(s.id, { limit: GUIDE_WORD_LIMIT });
          return { id: s.id, name: s.name, words: page.items };
        }),
      );
      const allProgress = (
        await Promise.all(chosen.map((s) => getAllProgressForSet(s.id)))
      ).flat();
      const allWords = guideSets.flatMap((s) => s.words);
      const confusionPairs = computeConfusionPairs(allWords, allProgress);
      setGuide({ sets: guideSets, confusionPairs });
    } finally {
      setGenerating(false);
    }
  }

  const markdown = guide ? generateStudyGuideMarkdown(guide) : '';
  const html = guide ? generateStudyGuideHtml(guide) : '';

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <h1 className="font-display uppercase text-lg">Study guide</h1>

      <Card className="flex flex-col gap-3">
        <p className="font-display text-xs uppercase">Pick sets</p>
        <div className="flex flex-col gap-1">
          {(sets ?? []).map((s: SetInfo) => (
            <label key={s.id} className="flex items-center gap-2 font-body text-sm">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="w-5 h-5 accent-black" />
              {s.name}
            </label>
          ))}
        </div>
        <Button variant="yellow" disabled={selectedList.length === 0 || generating} onClick={() => void generate()}>
          {generating ? 'Generating…' : 'Generate guide'}
        </Button>
      </Card>

      {guide && (
        <Card className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            <Button variant="lime" onClick={() => download('study-guide.md', markdown, 'text/markdown')}>
              Export Markdown
            </Button>
            <Button variant="cyan" onClick={() => download('study-guide.html', html, 'text/html')}>
              Export HTML
            </Button>
          </div>
          <pre className="font-body text-xs whitespace-pre-wrap max-h-96 overflow-auto border-[3px] border-black p-3 bg-white">
            {markdown}
          </pre>
        </Card>
      )}
    </div>
  );
}
