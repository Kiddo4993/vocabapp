import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function SessionComplete({
  correct,
  total,
  onRestart,
}: {
  correct?: number;
  total: number;
  onRestart: () => void;
}) {
  return (
    <div className="max-w-md mx-auto p-6">
      <Card className="bg-[var(--lime)] flex flex-col gap-4 items-start">
        <h1 className="font-display uppercase text-xl">Round complete</h1>
        {correct !== undefined && (
          <p className="font-body text-sm">
            {correct} / {total} correct
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="paper" onClick={onRestart}>
            Study again
          </Button>
          <Link to="/">
            <Button variant="ink">Home</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
