import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@market/ui';
import { usePlansQuery } from '../../hooks/use-plans-query.js';
import { useDeletePlan } from '../../hooks/use-plan-mutations.js';
import { parseSort, type PlanListSearch } from '../../search-schemas.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';
import { PlanCreateDialog } from '../../features/plans/plan-create-dialog.js';

export function PlansListPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/plans' }) as PlanListSearch;
  const del = useDeletePlan();

  const { data, isLoading, error } = usePlansQuery({
    skip: search.skip,
    take: search.take,
    q: search.q,
    sort: parseSort<'name' | 'createdAt' | 'updatedAt'>(search.sort),
    type: search.type,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plans</h1>
        <PlanCreateDialog />
      </div>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && (
        <>
          <div className="grid gap-3">
            {data.data.length === 0 && <p className="text-muted-foreground">No plans yet.</p>}
            {data.data.map((p) => (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>
                    <a className="hover:underline" href={`/plans/${p.id}`}>{p.name}</a>
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => void del.mutateAsync(p.id)}>Delete</Button>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {p.type} · {p.strategy} · {p.lineCount} line{p.lineCount === 1 ? '' : 's'}
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationControls
            skip={data.meta.skip}
            take={data.meta.take}
            total={data.meta.total}
            onChange={(n) => void nav({ to: '/plans', search: { ...search, ...n } })}
          />
        </>
      )}
    </div>
  );
}
