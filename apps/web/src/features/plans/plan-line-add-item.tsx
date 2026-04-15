import { useState } from 'react';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, Input, Skeleton,
} from '@market/ui';
import { useItemsQuery } from '../../hooks/use-items-query.js';
import { useAddPlanLine } from '../../hooks/use-plan-mutations.js';

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function PlanLineAddItem({ planIdOrSlug }: { planIdOrSlug: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const results = useItemsQuery({ skip: 0, take: 20, q: q.length > 0 ? q : undefined });
  const add = useAddPlanLine(planIdOrSlug);

  const pick = async (itemSlug: string) => {
    await add.mutateAsync({ kind: 'item', itemIdOrSlug: itemSlug, quantity: qty });
    setOpen(false);
    setQ('');
    setQty(1);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add item line</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Pick an item</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="w-20" />
        </div>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {results.isLoading && <Skeleton className="h-20 w-full" />}
          {results.data?.data.length === 0 && <p className="text-muted-foreground">No results.</p>}
          {results.data?.data.map((it) => (
            <button
              key={it.id}
              type="button"
              className="flex w-full items-center justify-between rounded border p-3 text-left hover:bg-muted"
              onClick={() => void pick(it.slug)}
            >
              <div>
                <div className="font-medium">{it.name}</div>
                <div className="text-xs text-muted-foreground">{it.storeName} · {it.vendor}</div>
              </div>
              <div className="font-semibold">{formatMinor(it.priceMinor, it.currency)}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
