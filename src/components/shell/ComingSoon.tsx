import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

/** Placeholder for a route whose real implementation lands in a later
 * milestone — swapped out in place (same file path) so router.tsx never
 * has to change when the feature actually gets built. */
export function ComingSoon({ title, milestone }: { title: string; milestone: string }) {
  return (
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <h1 className="font-display uppercase text-lg">{title}</h1>
        <p className="font-body text-sm mt-2">Lands in {milestone}.</p>
        <Link to="/" className="inline-block mt-4">
          <Button variant="paper">Back home</Button>
        </Link>
      </Card>
    </div>
  );
}
