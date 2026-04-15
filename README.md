# Market

Multi-vendor grocery/food delivery aggregator for Georgia. Crawls Wolt (and — via stubbed adapters — Glovo, Bolt Food, Europroduct, Goodwill), persists a unified catalog in Postgres + pgvector, and exposes it via a REST API, an MCP server, and a web UI.

## Stack

- **Monorepo:** pnpm 9 + Turborepo 2
- **Apps:** `apps/web` (Vite/React/Tailwind/TanStack) · `apps/api` (Fastify/Drizzle/Postgres+pgvector/Valibot) · `apps/mcp` (Model Context Protocol server)
- **Shared packages:** `@market/contracts` (valibot schemas) · `@market/ui` (shadcn/ui components) · `@market/config` (eslint/prettier/tsconfig/madge) · `@market/vendor-core` + `@market/vendor-<name>` (vendor adapters)

## Getting started

```bash
# 1. Install deps
pnpm install

# 2. Start postgres
docker compose up -d postgres

# 3. Copy env
cp .env.example .env

# 4. Migrate the DB
pnpm db:migrate

# 5. Run the api
pnpm --filter @market/api dev

# 6. In another shell, crawl Wolt for one venue
pnpm crawl -- --vendor wolt --venue carrefour-express-tbilisi

# 7. Query the catalog
curl 'http://localhost:3000/v1/catalog/search?q=milk'

# 8. Run the web UI
pnpm --filter @market/web dev
```

## Tasks

| Script | Description |
|---|---|
| `pnpm build` | Build all packages + apps via Turbo |
| `pnpm dev` | Start all apps in watch mode |
| `pnpm lint` | Lint everything |
| `pnpm typecheck` | Type-check everything |
| `pnpm check:circular` | Fail on circular deps (madge) |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:generate` | Generate a new migration |
| `pnpm crawl` | Run the multi-vendor crawler CLI |

## Architecture

See [`docs/superpowers/specs/2026-04-15-market-monorepo-design.md`](docs/superpowers/specs/2026-04-15-market-monorepo-design.md) for the full design.
