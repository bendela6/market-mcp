import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@market/ui';
import { api } from '../api-client.js';
import { environment } from '../environment.js';

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function HomePage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const search = useQuery({
    queryKey: ['search', submitted],
    queryFn: () => api.searchItems(submitted),
    enabled: submitted.length > 0,
  });

  return (
    <div className="container mx-auto max-w-3xl py-10">
      <h1 className="mb-2 text-3xl font-bold">{environment.VITE_APP_NAME}</h1>
      <p className="mb-6 text-muted-foreground">Hybrid search over the multi-vendor catalog.</p>

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <Input
          placeholder="Search for products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit">Search</Button>
      </form>

      {search.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {search.error && <p className="text-destructive">{String(search.error)}</p>}

      {search.data && (
        <div className="space-y-3">
          {search.data.items.length === 0 && <p>No results.</p>}
          {search.data.items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    {item.venueName} · {item.vendor}
                  </span>
                  <span className="font-semibold">
                    {formatMinor(item.priceMinor, item.currency)}
                  </span>
                </div>
                {item.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/')({ component: HomePage });
