import type { ComputePlanResponse } from '@market/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@market/ui';

function fmt(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function PlanComputePanel({ result }: { result: ComputePlanResponse | undefined }) {
  if (!result) return null;
  return (
    <div className="space-y-4">
      {result.cheapestPerItem && (
        <Card>
          <CardHeader><CardTitle>Cheapest per item</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Subtotal: {fmt(result.cheapestPerItem.itemsSubtotalMinor, result.cheapestPerItem.currency)}</div>
            <div>Delivery: {fmt(result.cheapestPerItem.deliverySubtotalMinor, result.cheapestPerItem.currency)}</div>
            <div className="font-semibold">Total: {fmt(result.cheapestPerItem.grandTotalMinor, result.cheapestPerItem.currency)}</div>
            <div className="text-muted-foreground">Venues: {result.cheapestPerItem.uniqueVenues.join(', ') || '—'}</div>
            {result.cheapestPerItem.unmet.length > 0 && (
              <div className="text-destructive">Unmet: {result.cheapestPerItem.unmet.join(', ')}</div>
            )}
          </CardContent>
        </Card>
      )}
      {result.singleStore && (
        <Card>
          <CardHeader><CardTitle>Single store: {result.singleStore.venueName}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Subtotal: {fmt(result.singleStore.itemsSubtotalMinor, result.singleStore.currency)}</div>
            <div>Delivery: {fmt(result.singleStore.deliveryFeeMinor, result.singleStore.currency)}</div>
            <div className="font-semibold">Total: {fmt(result.singleStore.grandTotalMinor, result.singleStore.currency)}</div>
            {result.singleStore.unmet.length > 0 && (
              <div className="text-destructive">Unmet: {result.singleStore.unmet.join(', ')}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
