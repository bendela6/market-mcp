import { Button } from '@market/ui';

interface Props {
  skip: number;
  take: number;
  total: number;
  onChange: (next: { skip: number; take: number }) => void;
}

export function PaginationControls({ skip, take, total, onChange }: Props) {
  const page = Math.floor(skip / take) + 1;
  const pages = Math.max(1, Math.ceil(total / take));
  const prev = () => onChange({ skip: Math.max(0, skip - take), take });
  const next = () => onChange({ skip: skip + take, take });
  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Showing {total === 0 ? 0 : skip + 1}–{Math.min(skip + take, total)} of {total} · Page {page} / {pages}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={prev} disabled={skip === 0}>Previous</Button>
        <Button variant="outline" size="sm" onClick={next} disabled={skip + take >= total}>Next</Button>
      </div>
    </div>
  );
}
