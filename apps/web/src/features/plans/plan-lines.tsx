import { Button } from '@market/ui';
import type { PlanLine, PlanType } from '@market/contracts';
import { PlanLineAddQuery } from './plan-line-add-query.js';
import { PlanLineAddItem } from './plan-line-add-item.js';
import { useRemovePlanLine } from '../../hooks/use-plan-mutations.js';

interface Props {
  planIdOrSlug: string;
  planType: PlanType;
  lines: PlanLine[];
}

export function PlanLines({ planIdOrSlug, planType, lines }: Props) {
  const removeLine = useRemovePlanLine(planIdOrSlug);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {(planType === 'query-based' || planType === 'mixed') && <PlanLineAddQuery planIdOrSlug={planIdOrSlug} />}
        {(planType === 'item-based'  || planType === 'mixed') && <PlanLineAddItem  planIdOrSlug={planIdOrSlug} />}
      </div>

      <div className="divide-y rounded border">
        {lines.length === 0 && <div className="p-4 text-sm text-muted-foreground">No lines yet.</div>}
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between p-3">
            <div className="text-sm">
              <span className="mr-2 rounded bg-muted px-2 py-0.5 text-xs uppercase">{l.kind}</span>
              {l.kind === 'query' ? l.query : l.itemName}
              <span className="ml-2 text-muted-foreground">× {l.quantity}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void removeLine.mutateAsync(l.id)}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
