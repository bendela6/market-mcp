# Wolt order history integration — design

Date: 2026-04-16
Status: Draft

## Goal

Let an authenticated user of market_mcp connect their personal Wolt
account, pull their order history into our database on demand, and browse
it through a new `/orders` listing page that matches the existing stores
/ products / plans pattern. Stored orders feed future features (past-
purchase hints, price-history, shopping-list suggestions).

## Non-goals

- Automated / scheduled background sync. All syncs are user-triggered.
- Multi-vendor order history. Scope is Wolt only; the `vendor_sync_jobs`
  table leaves room for future vendors but no other vendor client is
  wired up.
- OAuth-style login flow. Wolt has no public consumer OAuth; the user
  pastes their `__wtoken` + `__wrtoken` manually from devtools.
- A real background job queue (BullMQ / Sidekiq). Syncs run as in-process
  fire-and-forget tasks tracked in the `vendor_sync_jobs` table.
- Cross-user deduplication of Wolt API calls.

## Architecture

```
Browser                  Fastify API                   Wolt APIs
--------                 -----------                   ---------
/orders page  ─X-User-Id─▶  /me/wolt/*     ─ AES-GCM ─▶  users table
                             /me/orders/*                (encrypted tokens)
                                  │
                                  │ decrypted access token
                                  ▼
                           ordersService ────▶ WoltClient
                                │                  │
                                ▼                  ▼
                           sync engine      restaurant-api.wolt.com
                                │            consumer-api.wolt.com
                                ▼
                     wolt_orders / wolt_order_items /
                     vendor_sync_jobs tables
```

Layers:
- New `/me/wolt/*` routes for token connect / disconnect / status.
- New `/me/orders/*` routes for listing, detail, sync trigger, sync poll.
- New `ordersService` sits between routes and DB.
- New `woltOrderSync` engine drives paged Wolt calls and writes into the
  tables, yielding progress updates into `vendor_sync_jobs`.
- Wolt vendor client gains three Wolt-specific methods:
  `listOrderHistory`, `getOrderDetailsByIds`, `refreshAccessToken`.

Principle: the decrypted token exists only inside the sync engine for
the duration of a single Wolt call. It is never serialized to disk
outside the encrypted columns, never logged, never returned to the web
client.

## Database schema

Three new tables plus three new columns on `users`.

### `users` — new columns

```sql
ALTER TABLE users
  ADD COLUMN wolt_access_token_enc  text,
  ADD COLUMN wolt_refresh_token_enc text,
  ADD COLUMN wolt_connected_at      timestamptz;
```

- All three are nullable. `wolt_connected_at IS NOT NULL` is the sole
  "connected" signal read by the API; no route ever reads the tokens
  just to check connection state.
- Token blobs are `base64(iv ‖ ciphertext ‖ authTag)` from AES-256-GCM.

### `wolt_orders`

```sql
CREATE TABLE wolt_orders (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wolt_order_id        text        NOT NULL,
  placed_at            timestamptz NOT NULL,
  delivered_at         timestamptz,
  status               text        NOT NULL,
  venue_vendor_slug    text        NOT NULL,
  venue_name           text        NOT NULL,
  venue_product_line   product_line,
  store_id             uuid        REFERENCES stores(id) ON DELETE SET NULL,
  total_minor          integer,
  currency             text        NOT NULL,
  details_scraped_at   timestamptz,
  raw_summary          jsonb       NOT NULL,
  raw_details          jsonb,
  synced_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wolt_orders_user_wolt_order_uq UNIQUE (user_id, wolt_order_id)
);

CREATE INDEX wolt_orders_user_placed_ix ON wolt_orders (user_id, placed_at DESC);
CREATE INDEX wolt_orders_user_venue_ix  ON wolt_orders (user_id, venue_vendor_slug);
CREATE INDEX wolt_orders_user_status_ix ON wolt_orders (user_id, status);
```

### `wolt_order_items`

```sql
CREATE TABLE wolt_order_items (
  id                uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid     NOT NULL REFERENCES wolt_orders(id) ON DELETE CASCADE,
  wolt_item_id      text     NOT NULL,
  name              text     NOT NULL,
  quantity          numeric  NOT NULL,
  unit_price_minor  integer,
  total_minor       integer,
  currency          text     NOT NULL,
  image_url         text,
  gtin              text,
  item_id           uuid     REFERENCES items(id) ON DELETE SET NULL,
  raw               jsonb    NOT NULL,

  CONSTRAINT wolt_order_items_order_item_uq UNIQUE (order_id, wolt_item_id)
);

CREATE INDEX wolt_order_items_name_ix ON wolt_order_items (name);
```

### `vendor_sync_jobs`

```sql
CREATE TABLE vendor_sync_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor          text        NOT NULL,
  mode            text        NOT NULL,         -- 'latest' | 'full'
  with_details    boolean     NOT NULL,
  status          text        NOT NULL,         -- 'queued' | 'running' | 'succeeded' | 'failed'
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  orders_seen     integer     NOT NULL DEFAULT 0,
  orders_new      integer     NOT NULL DEFAULT 0,
  orders_updated  integer     NOT NULL DEFAULT 0,
  details_fetched integer     NOT NULL DEFAULT 0,
  error_message   text
);

CREATE INDEX vendor_sync_jobs_user_vendor_ix ON vendor_sync_jobs (user_id, vendor, started_at DESC);
```

Soft FKs (`wolt_orders.store_id`, `wolt_order_items.item_id`) let the
listing page join against our existing catalog for future past-purchase
features. Null when no confident match.

## Wolt client extensions

New methods on `WoltClient` in `packages/vendors/wolt/src/client.ts`:

```ts
interface WoltClient {
  // existing ...
  listOrderHistory(opts: {
    accessToken: string;
    cursor?: string;
    stopAtOrderId?: string;
  }): Promise<{
    orders: WoltOrderSummary[];
    nextCursor?: string;
    reachedStop: boolean;
  }>;

  getOrderDetailsByIds(opts: {
    accessToken: string;
    orderIds: string[];
  }): Promise<WoltOrderDetails[]>;

  refreshAccessToken(opts: {
    refreshToken: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  }>;
}
```

- Every authenticated call sends `Authorization: Bearer <accessToken>`
  alongside the existing Wolt headers.
- Tokens are only passed in as arguments. The client never reads from
  env, storage, or cookies.
- Chunking: `getOrderDetailsByIds` chunks internally to respect Wolt's
  batch size (to be confirmed during implementation; current guess ≤ 20).

### Error taxonomy

- `WoltAuthExpiredError` — Wolt returned 401. Caller in the sync engine
  catches this, invokes `refreshAccessToken`, retries once.
- `WoltRateLimitError` — 429. Caller sleeps for `Retry-After` seconds and
  retries up to 3 times.
- `WoltClientError` — anything else. Caller logs and surfaces a generic
  failure in the sync job.

### Normalized types

Added to `@market/vendor-core/types.ts`:

```ts
interface WoltOrderSummary {
  woltOrderId: string;
  placedAt: string;
  deliveredAt?: string;
  status: string;
  venueId: string;
  venueSlug: string;
  venueName: string;
  venueProductLine?: string;
  totalMinor?: number;
  currency: string;
  raw: unknown;
}

interface WoltOrderDetails {
  woltOrderId: string;
  items: Array<{
    woltItemId: string;
    name: string;
    quantity: number;
    unitPriceMinor?: number;
    totalMinor?: number;
    currency: string;
    imageUrl?: string;
    gtin?: string;
    raw: unknown;
  }>;
  raw: unknown;
}
```

Mapping happens in new `normalizeOrderSummary` / `normalizeOrderDetails`
helpers in the Wolt client, mirroring the existing `normalizeVenue` /
`normalizeItem` pattern.

## API routes

All routes use the existing `app.requireUser` preHandler. The client
identifies itself via `X-User-Id` the same way `/plans` does today.

### Token routes — `routes/me-wolt.ts`

```
POST   /me/wolt/connect
  body:    { accessToken: string, refreshToken: string }
  effect:  encrypts both, writes to users row, sets wolt_connected_at
  returns: { connected: true, connectedAt: ISO }

DELETE /me/wolt/connect
  effect:  nulls token columns and wolt_connected_at
  returns: { connected: false }

GET    /me/wolt/status
  returns: {
    connected: boolean,
    connectedAt: ISO | null,
    lastSyncAt: ISO | null,
    ordersInDb: number,
  }
```

`GET /me/wolt/status` never returns token values, not even masked.

### Order routes — `routes/me-orders.ts`

```
POST   /me/orders/query
  body:    PaginationBase + {
             sort?, venueSlug?, productLine?, status?,
             hasDetails?, placedFrom?, placedTo?,
           }
  returns: envelope(OrderSchema)

GET    /me/orders/:id
  returns: { order: Order, items: OrderItem[] }

POST   /me/orders/sync
  body:    { mode: 'latest'|'full', withDetails: boolean }
  effect:  creates vendor_sync_jobs row (status='queued'), fires async
           sync task, returns immediately. If a running/queued job for
           this user+vendor already exists, returns 409 with the existing
           job id.
  returns: { jobId, status: 'queued' }

GET    /me/orders/sync/:id
  returns: full vendor_sync_jobs row (except no user_id leak)
```

### Contracts

New file `packages/contracts/src/orders.ts` with valibot schemas
following the exact pattern of `stores.ts`: `OrderSchema`, `OrderItemSchema`,
`OrderListQueryBodySchema`, `OrderListResponseSchema`, `SyncJobSchema`,
`ConnectWoltBodySchema`, `WoltStatusSchema`. Route constants added to
`packages/contracts/src/routes.ts`.

## Sync engine

File `apps/api/src/services/wolt-order-sync.ts`. Single entry point:

```
syncUserOrders({ userId, mode, withDetails }): Promise<SyncJob>
```

Algorithm:

1. Load user row. If `wolt_connected_at` is null, throw `NotConnectedError`.
2. Create `vendor_sync_jobs` row with `status='running'`.
3. Decrypt `wolt_access_token_enc`. This is the only place in the
   codebase that decrypts tokens.
4. Try:
   a. Determine `stopAtOrderId`:
      - `mode='latest'` → the newest `wolt_order_id` already in
        `wolt_orders` for this user, or undefined if the table is empty.
      - `mode='full'` → undefined.
   b. Page through `listOrderHistory`:
      - For each page: normalize, upsert into `wolt_orders` on conflict
        `(user_id, wolt_order_id)`. On conflict refresh `raw_summary`,
        `status`, `synced_at`; do NOT touch `details_scraped_at` or
        `raw_details`.
      - Increment `orders_seen`; bump `orders_new` for inserts and
        `orders_updated` for conflict updates.
      - Update the sync job row every ~5 orders so pollers see live
        progress.
      - If `reachedStop === true`, break.
      - If `nextCursor` is undefined, break.
   c. If `withDetails === true`:
      - Query `wolt_orders` for this user where `raw_details IS NULL`
        (includes both newly upserted orders and historical orders that
        never got details).
      - Batch the ids and call `getOrderDetailsByIds`.
      - For each detail: upsert `wolt_order_items` on conflict
        `(order_id, wolt_item_id)`, update `wolt_orders` with
        `details_scraped_at = now(), raw_details = ...`.
      - Attempt catalog matching: `item_id` by GTIN lookup first, then
        fuzzy name match scoped to the same `store_id`. Null if no
        confident match.
      - Increment `details_fetched`.
   d. Mark job `succeeded`, set `finished_at = now()`, clear
      `error_message`.
5. Catch `WoltAuthExpiredError`:
   a. Call `refreshAccessToken` with the decrypted refresh token.
   b. On success: re-encrypt both, update users row, retry the entire
      sync ONCE.
   c. On failure: null out both token columns + `wolt_connected_at`,
      mark job `failed` with `error_message = "Wolt session expired,
      please reconnect"`, return.
6. Catch anything else: mark job `failed`, `error_message =
   String(err).slice(0, 500)`, return.
7. Finally: access token plaintext falls out of scope. Stale job sweep:
   mark any `status='running'` job older than 15 minutes as `failed`
   with `error_message='stale'`.

### Invariants

- **Idempotent.** Running the same sync twice produces the same DB state.
- **Atomic per order.** Each upsert is its own transaction; mid-sync
  failures leave consistent partial progress.
- **Token never logged.** Error messages are truncated and client errors
  explicitly redact auth-header content.
- **One sync per user at a time.** 409 on second concurrent trigger.

### Deliberately out of scope

- Dry-run mode.
- Proactive token refresh before 401.
- Retry on network flakes beyond the one auth retry.
- Partial details updates: malformed detail responses skip that order
  and leave `details_scraped_at` null for the next sync to retry.

## Web UI

### Routes

```
/orders           → pages/orders/list.tsx
/orders/$orderId  → pages/orders/detail.tsx
```

The list route's `validateSearch` schema mirrors `/stores`: `q`, `skip`,
`take`, `sort`, plus orders-specific filters (`venueSlug`, `status`,
`productLine`, `hasDetails`, `placedFrom`, `placedTo`).

### `pages/orders/list.tsx`

Two visual states driven by `GET /me/wolt/status`:

**Not connected** — centered "Connect your Wolt account" panel:
- Two textareas: "Access token (`__wtoken`)" and "Refresh token
  (`__wrtoken`)".
- Short instruction block describing how to copy from wolt.com devtools.
- "Connect" button.
- Inline validation error area.
- Small footer: "Tokens are stored encrypted and never leave the server
  unless syncing your orders."

**Connected** — standard listing chrome matching `/stores`:
- Header with title + a "Refresh ▾" dropdown:
  - Latest only
  - Latest + details
  - Full rescrape
  - Full rescrape + details
  and a secondary "Disconnect" action.
- Filter bar: search input (`q`), venue dropdown, status chips,
  product-line chips, has-details toggle, date-range pickers.
- Sort dropdown reusing the existing `<Select>` pattern.
- `<PaginationControls>` at the bottom.
- Row cards: venue logo, venue name, placed-at, total, status badge,
  "details missing" badge. Click → `/orders/:id`.
- Sync progress banner: visible only while the current user has a
  `queued` or `running` job. Shows counters ("14/47 orders, 8 with
  details"). Auto-dismisses on success and refetches the list. On
  auth-expired failure, swaps to a red "Reconnect" state that returns
  the user to the empty-state panel.

### `pages/orders/detail.tsx`

Mirrors `pages/stores/detail.tsx`:
- Header: venue name (links to `/stores/:storeSlug` if `store_id`
  matched), placed-at, delivered-at, status badge, total.
- Items table: image, name, quantity, unit price, total, optional
  "view in catalog" link if `item_id` matched.
- "Details missing" empty state when `raw_details IS NULL`, with a
  button that triggers a sync (latest-only with details) so the sync
  engine picks up all missing-details rows.

### Hooks and client

`apps/web/src/hooks/use-orders-query.ts`:

```ts
export function useOrdersQuery(body: OrderListQueryBody);
export function useSyncJob(jobId: string | undefined);
```

`useSyncJob` uses React Query's `refetchInterval` to poll every 2s while
the job status is `queued` or `running`; stops polling on terminal
states.

`apps/web/src/api-client.ts` gains:

```
api.connectWolt({accessToken, refreshToken})
api.disconnectWolt()
api.getWoltStatus()
api.queryOrders(body)
api.getOrder(id)
api.startSync({mode, withDetails})
api.getSyncJob(id)
```

### Shared listing toolbar

Factor the search input + filter chips + sort dropdown + pagination
chrome into `apps/web/src/features/listing/listing-toolbar.tsx`. Stores,
products, plans, and orders all use it, eliminating four copies of
near-identical JSX. Scope is strictly the chrome currently duplicated;
filters remain per-page because they differ by domain.

## Encryption

- Algorithm: AES-256-GCM via `node:crypto` (no new dependency).
- Master key: `ENCRYPTION_KEY_HEX` in `.env`, 64 hex chars = 32 bytes.
  Required at API boot; missing value fails fast.
- Per-token IV: fresh 12-byte random per encryption call.
- Storage format: `base64(iv ‖ ciphertext ‖ authTag)`.
- Helper: `apps/api/src/lib/crypto.ts` (~40 lines), only used by the
  Wolt token service.
- Plaintext tokens only exist in memory inside the sync engine, for the
  duration of a single Wolt call.
- Key rotation: manual, not automated. Rotating invalidates all stored
  tokens and all users must reconnect.
- `.env.example` gets a commented line showing the expected format.
- `environment.ts` validates the key is present and 64 hex chars.

## Error handling

Token lifecycle is a two-state machine (`NEVER_CONNECTED` vs
`CONNECTED`) plus a transient `EXPIRED` state that collapses to
`NEVER_CONNECTED` by wiping the token columns. The UI reads the state
purely from the `wolt_connected_at` column and the most recent sync job
outcome.

| Error | Job status | UI |
|---|---|---|
| Network error mid-sync | `failed`, error="Network error" | Red banner, Retry link, token stays connected |
| 401 → refresh succeeds | `succeeded` | Silent |
| 401 → refresh fails | `failed`, error="…expired…" | Red banner, tokens wiped, Reconnect CTA |
| 429 exhausted | `failed` after retries | Red banner with "Retry later" |
| Malformed Wolt response | `failed`, captured error | Red banner, token stays connected |
| Bad token format on connect | 400 on POST /me/wolt/connect | Inline form error |

Server-side token input validation: non-empty strings, length-bounded
(reject > 4096 chars). No format assertion beyond that.

## Testing

Unit tests (vitest, following existing repo pattern):
- `normalizeOrderSummary` / `normalizeOrderDetails` with checked-in
  fixture JSON.
- `syncUserOrders` with a mocked `WoltClient` and test DB. Covers all
  four mode combinations, the `stopAtOrderId` shortcut, the idempotency
  invariant, and the 401-refresh-retry path.
- `crypto.ts` encrypt/decrypt roundtrip.

Route tests via Fastify `inject()` + test DB:
- Happy path for all 7 new endpoints.
- Auth guard: missing `X-User-Id` returns 401.
- Response bodies never include raw token values (explicit assertion).

Not tested:
- Live Wolt API — verified manually during implementation the same way
  the venue/category and search endpoints were.
- UI component tests — no harness today; manual verification in dev
  server before ship.

## Definition of done

1. `pnpm -r build` succeeds with all type errors resolved.
2. All new unit and route tests pass.
3. Manual end-to-end in dev: connect tokens, trigger each of 4 sync
   modes, see list populate, open a detail row, disconnect, reconnect.
4. DB inspection confirms token columns contain only ciphertext blobs.

## Assumptions to validate during implementation

These are implementation-level unknowns that don't affect the contract
shape and can be resolved when I wire each piece up:

1. Exact cursor / pagination parameter name on `/order-xp/web/v1/pages/orders`.
   If offset-based, `cursor?: string` becomes `offset?: number` in the
   client interface. Contract shapes are unaffected.
2. Exact URL and payload for the Wolt refresh-token endpoint. If Wolt
   has no usable refresh endpoint, the fallback is "tokens expire, user
   re-pastes." The sync engine's auth-expired branch still works
   correctly in that fallback.
3. Batch size ceiling for `getOrderDetailsByIds`. I'll start with 20,
   adjust based on observed 4xx responses.
4. Exact status string values Wolt uses ("delivered", "cancelled", etc).
   Captured on first real sync, used to populate the status filter chip
   list.

None of these block writing the implementation plan.

## Out of scope / future work

- Background refresh of tokens before they expire.
- Full-text search over item names via Postgres `tsvector` (initial
  version uses `ILIKE`; upgrade path obvious).
- "You've bought this before" hint on `/products` and `/plans`.
- Price-history graph per item using historical order data.
- Glovo / Bolt-Food order history.
