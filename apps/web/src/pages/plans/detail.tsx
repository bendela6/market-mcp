import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import type { ComputePlanResponse } from '@market/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@market/ui';
import { usePlan } from '../../hooks/use-plan.js';
import { useComputePlan } from '../../hooks/use-plan-mutations.js';
import { PlanLines } from '../../features/plans/plan-lines.js';
import { PlanComputePanel } from '../../features/plans/plan-compute-panel.js';

export function PlanDetailPage() {
  const { id } = useParams({ from: '/plans/$id' });
  const { data, isLoading, error } = usePlan(id);
  const compute = useComputePlan(id);
  const [computed, setComputed] = useState<ComputePlanResponse | undefined>();

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive">{String(error)}</p>;
  if (!data) return <p>Not found.</p>;

  const { plan, lines } = data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{plan.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge>{plan.type}</Badge>
            <Badge variant="secondary">{plan.strategy}</Badge>
            <Button
              onClick={async () => setComputed(await compute.mutateAsync())}
              disabled={compute.isPending}
            >
              {compute.isPending ? 'Computing…' : 'Compute'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Slug: {plan.slug} · Created: {new Date(plan.createdAt).toLocaleString()}
        </CardContent>
      </Card>

      <PlanLines planId={plan.id} planType={plan.type} lines={lines} />
      <PlanComputePanel result={computed} />
    </div>
  );
}
