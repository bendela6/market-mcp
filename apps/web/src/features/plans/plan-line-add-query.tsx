import { useState } from 'react';
import { Button, Input } from '@market/ui';
import { useAddPlanLine } from '../../hooks/use-plan-mutations.js';

export function PlanLineAddQuery({ planIdOrSlug }: { planIdOrSlug: string }) {
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const add = useAddPlanLine(planIdOrSlug);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    await add.mutateAsync({ kind: 'query', query: q.trim(), quantity: qty });
    setQ('');
    setQty(1);
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input placeholder="e.g. milk" value={q} onChange={(e) => setQ(e.target.value)} />
      <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="w-20" />
      <Button type="submit" disabled={add.isPending}>Add query line</Button>
    </form>
  );
}
