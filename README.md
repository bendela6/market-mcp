# Market

Multi-vendor grocery/food delivery aggregator for Georgia. Crawls Wolt (and — via stubbed adapters — Glovo, Bolt Food, Europroduct, Goodwill), persists a unified catalog in Postgres + pgvector, and exposes it via a REST API, an MCP server, and a web UI.

## Stack

- **Monorepo:** pnpm 9 + Turborepo 2
- **Apps:** `apps/web` (Vite/React/Tailwind/TanStack) · `apps/api` (Fastify/Drizzle/Postgres+pgvector/Valibot) · `apps/mcp` (Model Context Protocol server)
- **Shared packages:** `@market/contracts` (valibot schemas) · `@market/ui` (shadcn/ui components) · `@market/config` (eslint/prettier/tsconfig/madge) · `@market/vendor-core` + `@market/vendor-<name>` (vendor adapters)

## Getting started

**Prereqs:** Node ≥22, pnpm ≥9, Docker.

### One-time setup

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
```

### Run all services

The web app reads `VITE_API_URL` from the root `.env` and expects the API on `http://localhost:3000`. Start everything in watch mode with one command:

```bash
pnpm dev
```

This runs `postgres` (via Docker, started above), `@market/api`, `@market/mcp`, and `@market/web` via Turbo. Services:

| Service | URL | Command (individual) |
|---|---|---|
| Postgres (+pgvector) | `localhost:5432` | `docker compose up -d postgres` |
| API (Fastify) | http://localhost:3000 | `pnpm --filter @market/api dev` |
| MCP server | stdio (set `MCP_HTTP=1` for `:8787`) | `pnpm --filter @market/mcp dev` |
| Web UI (Vite) | http://localhost:5173 | `pnpm --filter @market/web dev` |

### Seed some data

```bash
pnpm crawl -- --vendor wolt --venue carrefour-express-tbilisi
curl 'http://localhost:3000/v1/catalog/search?q=milk'
```

### Stop

```bash
docker compose down          # stop postgres
# Ctrl+C in the `pnpm dev` terminal to stop the Node services
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
