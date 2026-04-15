# Store detail: scrape button

## Goal

Add a button to the store detail page that triggers an assortment scrape
(refresh of categories + items) for the store shown, and surfaces the result
via a toast.

## Background

`POST /v1/stores/:idOrSlug/refresh-assortment` already exists in
`apps/api/src/routes/stores.ts`. It fetches the vendor assortment index,
upserts categories, walks every category, and upserts items. It returns
`{ slug, categories, items, errors }`.

Today the route is gated by `app.requireApiToken` (Bearer token). The web app
does not send a bearer token — it only sends `x-user-id`.

The store detail page `apps/web/src/pages/stores/detail.tsx` is currently a
read-only card rendered from `useStore`.

## Design

### Backend

Remove the `{ preHandler: app.requireApiToken }` option from the
refresh-assortment route in `apps/api/src/routes/stores.ts`. No other changes.

Reason: until we add a proper auth story for mutating web actions, this
endpoint should be callable from the web app in the same way the other routes
(`query`, `get`) are.

### Contracts

No change. `RefreshAssortmentResponse` and `ROUTES.stores.refreshAssortment`
already exist.

### Web API client

Add one method to `apps/web/src/api-client.ts`:

```
refreshStoreAssortment: (idOrSlug: string) =>
  raw<RefreshAssortmentResponse>(
    ROUTES.stores.refreshAssortment(idOrSlug),
    { method: 'POST', body: JSON.stringify({}) },
  ),
```

### Web hook

New file `apps/web/src/hooks/use-store-mutations.ts`:

```
export function useRefreshStoreAssortment(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.refreshStoreAssortment(idOrSlug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores', 'get', idOrSlug] });
    },
  });
}
```

The component owns toast calls. The hook only handles query invalidation.

### Web UI

Edit `apps/web/src/pages/stores/detail.tsx`:

- Import `Button` and `toast` from `@market/ui`.
- Import `useRefreshStoreAssortment` from the new hook file.
- Make the `CardHeader` contain a flex row: the title on the left, the scrape
  button on the right.
- Button label: `Refresh assortment`. While `mutation.isPending` the label
  becomes `Refreshing…` and the button is `disabled`.
- On click: `mutation.mutate(undefined, { onSuccess, onError })` where
  - `onSuccess(r)` calls
    `toast.success(\`Scraped ${r.categories} categories, ${r.items} items${r.errors ? \`, ${r.errors} errors\` : ''}\`)`.
  - `onError(err)` calls `toast.error(String(err))`.

## Out of scope

- No inline display of the last scrape result (toast only).
- No authentication or token handling — dropping the preHandler is the
  whole auth story for now. A future change will reinstate a gate.
- No progress streaming. The endpoint is synchronous; the spinner is the
  only feedback during the call.

## Files touched

- `apps/api/src/routes/stores.ts`
- `apps/web/src/api-client.ts`
- `apps/web/src/hooks/use-store-mutations.ts` (new)
- `apps/web/src/pages/stores/detail.tsx`
