# Market Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing single-app `wolt-mcp` project into a pnpm + Turborepo monorepo with `apps/web`, `apps/api`, `apps/mcp`, a multi-vendor scraping architecture (`packages/vendors/*`), and pgvector-backed hybrid search.

**Architecture:** Three apps share data through a Fastify+Drizzle+Postgres API. `apps/mcp` and `apps/web` are HTTP clients of `apps/api`. The wolt scraper is extracted into `@market/vendor-wolt` behind a shared `Vendor` interface in `@market/vendor-core`. Embeddings run in-process inside `apps/api` via a polling worker over `embedding_jobs`.

**Tech Stack:** pnpm 9 · Turborepo 2.3 · Node 22 · TypeScript 5.6 · Fastify 5 · Drizzle ORM · Postgres 16 + pgvector · Valibot · Vite · React · Tailwind · TanStack Router/Query · shadcn/ui · ESLint 9 (flat config) · Prettier · madge

**Reference spec:** `docs/superpowers/specs/2026-04-15-market-monorepo-design.md` — authoritative for all architectural decisions. Several tasks below reference specific sections (e.g. `spec §4.3`) for large code blocks that are already committed in the spec file; when you see such a reference, open the spec and copy the code block verbatim into the target file.

**Testing policy for this plan:** User explicitly deferred tests. This is a scaffolding plan; tasks verify success via `tsc --noEmit`, `eslint`, `madge --circular`, `turbo run build`, and end-to-end smoke tests rather than unit tests. Do NOT introduce vitest/jest files.

---

## Task Overview

**Commit policy:** No mid-task commits. All work stays uncommitted in the working tree until every task is done; a single final commit step at the very end of the plan hands off to the `/commit` skill for grouping + messaging.

| # | Task |
|---|---|
| 1 | Stage existing code and prep workspace |
| 2 | Workspace root: pnpm, turbo, tsconfig, prettier, gitignore |
| 3 | `@market/config` package (eslint/prettier/tsconfig/madge) |
| 4 | `@market/vendor-core` package |
| 5 | `@market/vendor-wolt` package (port existing client) |
| 6 | Vendor stub packages (glovo, bolt-food, europroduct, goodwill) |
| 7 | `@market/contracts` package |
| 8 | `@market/ui` package (shadcn init + starter components) |
| 9 | `apps/api` scaffold: package.json, tsconfig, environment.ts, drizzle config |
| 10 | `apps/api` db schema (drizzle) + client |
| 11 | `apps/api` embedder interface + providers (voyage/openai/ollama/cohere) |
| 12 | `apps/api` vendor registry |
| 13 | `apps/api` catalog service (port `db/store.ts`) |
| 14 | `apps/api` shopping-list service (port `services/shoppingList.ts`) |
| 15 | `apps/api` embedding worker |
| 16 | `apps/api` Fastify routes (venues, catalog, shopping-list, admin) |
| 17 | `apps/api` crawler CLI (port `crawler/crawl.ts`) |
| 18 | `apps/api` server bootstrap |
| 19 | `apps/mcp` scaffold + market_* tools |
| 20 | `apps/web` scaffold: Vite, Tailwind, TanStack Router/Query, initial page |
| 21 | Root Dockerfile, docker-compose, .env.example, README |
| 22 | Delete legacy `src/`, `wolt.sqlite`, old root files |
| 23 | Install + build + lint + typecheck + circular verification |
| 24 | End-to-end smoke test |
| 25 | Final commit (invoke `/commit` skill) |

---

## Task 1: Stage existing code and prep workspace

**Purpose:** Move the legacy `src/` and `wolt.sqlite` into a staging location so scaffolding doesn't conflict, without losing the source of truth for the port tasks.

**Files:**
- Create: `.legacy/` (directory at repo root — git-ignored)
- Move: `src/` → `.legacy/src/`
- Move: `wolt.sqlite` → `.legacy/wolt.sqlite`
- Move: `dist/` → `.legacy/dist/` (if exists)
- Move: `package.json` → `.legacy/package.json`
- Move: `tsconfig.json` → `.legacy/tsconfig.json`
- Move: `Dockerfile` → `.legacy/Dockerfile`
- Move: `docker-compose.yml` → `.legacy/docker-compose.yml`
- Move: `.dockerignore` → `.legacy/.dockerignore`
- Keep: `README.md` (will be rewritten in Task 21)
- Keep: `tailscale-serve.json`
- Keep: `.env`, `.env.example` (will be replaced in Task 21)
- Keep: `docs/` (contains spec + this plan)

- [ ] **Step 1: Verify current state**

Run:
```bash
ls -la
```
Expected: see `src/`, `wolt.sqlite`, `package.json`, `tsconfig.json`, `Dockerfile`, `docker-compose.yml`, `docs/`, `.env`, `.env.example`.

- [ ] **Step 2: Create `.legacy/` and move files**

Use plain `mv` — the root files are currently untracked in git (single final commit at the end of the plan), so `git mv` would error. Plain `mv` leaves them as untracked under `.legacy/`, which is exactly what we want.

Run:
```bash
mkdir -p .legacy
mv src .legacy/src
mv wolt.sqlite .legacy/wolt.sqlite 2>/dev/null || true
mv package.json .legacy/package.json
mv tsconfig.json .legacy/tsconfig.json
mv Dockerfile .legacy/Dockerfile
mv docker-compose.yml .legacy/docker-compose.yml
mv .dockerignore .legacy/.dockerignore
[ -d dist ] && rm -rf dist
```

- [ ] **Step 3: Create root `.gitignore`**

Create `.gitignore`:
```
# Node / pnpm
node_modules/
.pnpm-store/

# Build artefacts
dist/
build/
.turbo/
*.tsbuildinfo

# Env
.env
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# Legacy staging (kept in-tree for porting, deleted in Task 22)
# Not ignored — it is the source of truth for the port tasks, deleted in Task 22.

# Editor
.vscode/
.idea/
```

---

## Task 2: Workspace root (pnpm, turbo, root tsconfig, prettier, .env.example stub)

**Purpose:** Establish the workspace so subsequent tasks can create packages inside it.

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.json`
- Create: `.npmrc`
- Create: `.prettierignore`
- Create: `.env.example`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/vendors/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "market",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=22",
    "pnpm": ">=9"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "check:circular": "turbo run check:circular",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,md}\"",
    "clean": "turbo run clean && rimraf node_modules",
    "test": "turbo run test",
    "db:generate": "pnpm --filter @market/api db:generate",
    "db:migrate": "pnpm --filter @market/api db:migrate",
    "crawl": "pnpm --filter @market/api crawl"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "prettier": "^3.3.3",
    "prettier-plugin-tailwindcss": "^0.6.8",
    "rimraf": "^6.0.1",
    "typescript": "^5.6.3"
  },
  "prettier": "@market/config/prettier"
}
```

- [ ] **Step 3: Create `turbo.json`**

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": ["**/.env.*local", ".env"],
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL",
    "API_URL",
    "API_TOKEN",
    "API_PORT",
    "EMBEDDER",
    "EMBEDDING_WORKER",
    "VOYAGE_API_KEY",
    "OPENAI_API_KEY",
    "OLLAMA_BASE_URL",
    "COHERE_API_KEY",
    "ENABLED_VENDORS",
    "WOLT_LAT",
    "WOLT_LON",
    "MCP_HTTP",
    "MCP_PORT",
    "MCP_TLS_CERT",
    "MCP_TLS_KEY",
    "VITE_API_URL",
    "VITE_APP_NAME"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "lint": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "check:circular": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 4: Create root `tsconfig.json`**

```jsonc
{
  "files": [],
  "references": [
    { "path": "./packages/config" },
    { "path": "./packages/vendors/core" },
    { "path": "./packages/vendors/wolt" },
    { "path": "./packages/vendors/glovo" },
    { "path": "./packages/vendors/bolt-food" },
    { "path": "./packages/vendors/europroduct" },
    { "path": "./packages/vendors/goodwill" },
    { "path": "./packages/contracts" },
    { "path": "./packages/ui" },
    { "path": "./apps/api" },
    { "path": "./apps/mcp" },
    { "path": "./apps/web" }
  ]
}
```

- [ ] **Step 5: Create `.npmrc`**

```
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=false
enable-pre-post-scripts=true
```

- [ ] **Step 6: Create `.prettierignore`**

```
node_modules
dist
build
.turbo
.legacy
pnpm-lock.yaml
apps/api/drizzle/meta
```

- [ ] **Step 7: Create root `.env.example` (stub — expanded in Task 21)**

```
# Copy this to .env (gitignored). Expanded in Task 21.
NODE_ENV=development
DATABASE_URL=postgres://market:market@localhost:5432/market
```

---

## Task 3: `@market/config` package

**Purpose:** Central ESLint, Prettier, TypeScript, and madge configuration shared by every package in the monorepo.

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json` (for the config package itself to have a buildable/checkable target)
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/tsconfig/node.json`
- Create: `packages/config/tsconfig/react.json`
- Create: `packages/config/tsconfig/package.json` (emit `.d.ts`)
- Create: `packages/config/eslint/base.js`
- Create: `packages/config/eslint/node.js`
- Create: `packages/config/eslint/react.js`
- Create: `packages/config/eslint/boundaries.js`
- Create: `packages/config/prettier/index.js`
- Create: `packages/config/madge/madge.config.cjs`

- [ ] **Step 1: Create `packages/config/package.json`**

```json
{
  "name": "@market/config",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    "./eslint/base": "./eslint/base.js",
    "./eslint/node": "./eslint/node.js",
    "./eslint/react": "./eslint/react.js",
    "./eslint/boundaries": "./eslint/boundaries.js",
    "./prettier": "./prettier/index.js",
    "./tsconfig/base": "./tsconfig/base.json",
    "./tsconfig/node": "./tsconfig/node.json",
    "./tsconfig/react": "./tsconfig/react.json",
    "./tsconfig/package": "./tsconfig/package.json",
    "./madge": "./madge/madge.config.cjs"
  },
  "scripts": {
    "build": "echo '(no build) ok'",
    "lint": "echo '(no lint) ok'",
    "typecheck": "echo '(no typecheck) ok'",
    "check:circular": "echo '(no src) ok'",
    "clean": "echo '(no dist) ok'"
  },
  "devDependencies": {
    "@eslint/js": "^9.15.0",
    "eslint": "^9.15.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-boundaries": "^5.0.1",
    "eslint-plugin-react": "^7.37.2",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-jsx-a11y": "^6.10.2",
    "globals": "^15.12.0",
    "madge": "^8.0.0",
    "prettier-plugin-tailwindcss": "^0.6.8",
    "typescript-eslint": "^8.16.0"
  }
}
```

- [ ] **Step 2: Create `packages/config/tsconfig.json` (empty project marker)**

```json
{
  "compilerOptions": {
    "composite": true,
    "noEmit": true
  },
  "include": [],
  "files": []
}
```

- [ ] **Step 3: Create `packages/config/tsconfig/base.json`**

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "useDefineForClassFields": true
  }
}
```

- [ ] **Step 4: Create `packages/config/tsconfig/node.json`**

```jsonc
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "lib": ["ES2022"]
  }
}
```

- [ ] **Step 5: Create `packages/config/tsconfig/react.json`**

```jsonc
{
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  }
}
```

- [ ] **Step 6: Create `packages/config/tsconfig/package.json`**

```jsonc
{
  "extends": "./base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

- [ ] **Step 7: Create `packages/config/eslint/base.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['**/dist/**', '**/build/**', '**/.turbo/**', '**/node_modules/**', '.legacy/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
];
```

- [ ] **Step 8: Create `packages/config/eslint/node.js`**

```js
import globals from 'globals';
import base from './base.js';

export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read env via ./environment.ts, not process.env directly.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read env via ./environment.ts, not process.env directly.',
        },
      ],
    },
  },
  {
    // The only file allowed to read process.env directly.
    files: ['**/environment.ts'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
```

- [ ] **Step 9: Create `packages/config/eslint/react.js`**

```js
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import base from './base.js';

export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
];
```

- [ ] **Step 10: Create `packages/config/eslint/boundaries.js`**

```js
import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'vendor-core', pattern: 'packages/vendors/core' },
        { type: 'vendor', pattern: 'packages/vendors/*' },
        { type: 'contracts', pattern: 'packages/contracts' },
        { type: 'ui', pattern: 'packages/ui' },
        { type: 'config', pattern: 'packages/config' },
      ],
      'boundaries/include': ['apps/**/*', 'packages/**/*'],
      'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['contracts', 'ui', 'vendor', 'vendor-core', 'config'] },
            { from: 'vendor', allow: ['vendor-core', 'config'] },
            { from: 'vendor-core', allow: ['config'] },
            { from: 'ui', allow: ['config'] },
            { from: 'contracts', allow: ['config'] },
          ],
        },
      ],
    },
  },
];
```

- [ ] **Step 11: Create `packages/config/prettier/index.js`**

```js
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  plugins: ['prettier-plugin-tailwindcss'],
};
```

- [ ] **Step 12: Create `packages/config/madge/madge.config.cjs`**

```js
module.exports = {
  fileExtensions: ['ts', 'tsx'],
  tsConfig: './tsconfig.json',
  excludeRegExp: [/\.d\.ts$/, /node_modules/, /dist/, /\.legacy/],
  detectiveOptions: {
    ts: { skipTypeImports: true },
    tsx: { skipTypeImports: true },
  },
};
```

---

## Task 4: `@market/vendor-core` package

**Purpose:** Define the `Vendor` interface and shared domain types (Venue, Product, AssortmentCategory, etc.) that every vendor package implements and every consumer depends on.

**Files:**
- Create: `packages/vendors/core/package.json`
- Create: `packages/vendors/core/tsconfig.json`
- Create: `packages/vendors/core/eslint.config.js`
- Create: `packages/vendors/core/src/types.ts`
- Create: `packages/vendors/core/src/vendor.ts`
- Create: `packages/vendors/core/src/registry.ts`
- Create: `packages/vendors/core/src/errors.ts`
- Create: `packages/vendors/core/src/index.ts`

- [ ] **Step 1: Create `packages/vendors/core/package.json`**

```json
{
  "name": "@market/vendor-core",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean": "rimraf dist"
  },
  "dependencies": {},
  "devDependencies": {
    "@market/config": "workspace:*",
    "madge": "^8.0.0",
    "rimraf": "^6.0.1",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create `packages/vendors/core/tsconfig.json`**

```jsonc
{
  "extends": "@market/config/tsconfig/package",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/vendors/core/eslint.config.js`**

```js
import node from '@market/config/eslint/node';
import boundaries from '@market/config/eslint/boundaries';

export default [...node, ...boundaries];
```

- [ ] **Step 4: Create `packages/vendors/core/src/errors.ts`**

```ts
export class VendorError extends Error {
  constructor(
    public readonly vendorId: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${vendorId}] ${message}`);
    this.name = 'VendorError';
  }
}

export class NotImplementedError extends VendorError {
  constructor(vendorId: string, method: string) {
    super(vendorId, `${method} not implemented`);
    this.name = 'NotImplementedError';
  }
}
```

- [ ] **Step 5: Create `packages/vendors/core/src/types.ts`**

```ts
export type VendorId = 'wolt' | 'glovo' | 'bolt-food' | 'europroduct' | 'goodwill';

export type ProductLine = 'restaurant' | 'store' | 'grocery' | 'pharmacy' | 'other';

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface Venue {
  vendor: VendorId;
  id: string;
  slug: string;
  name: string;
  shortDescription?: string;
  address?: string;
  city?: string;
  country?: string;
  currency?: string;
  location?: Coordinates;
  rating?: { score?: number; volume?: number };
  priceRange?: number;
  deliveryPriceInt?: number;
  deliveryPriceText?: string;
  estimateMinutes?: number;
  estimateRange?: { min: number; max: number };
  online?: boolean;
  tags?: string[];
  categories?: string[];
  productLine?: ProductLine;
  iconUrl?: string;
  brandImageUrl?: string;
  raw?: unknown;
}

export interface AssortmentCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  itemIds: string[];
  subcategories: AssortmentCategory[];
}

export interface Product {
  vendor: VendorId;
  id: string;
  name: string;
  description?: string;
  /** Integer minor units in the venue's currency (e.g. tetri for GEL). */
  price: number;
  originalPrice?: number;
  currency: string;
  unitPrice?: { price: number; unit: string };
  unitInfo?: string;
  gtin?: string | null;
  images: string[];
  categoryId?: string;
  categorySlug?: string;
  tags?: string[];
  disabled?: boolean;
  raw?: unknown;
}

export interface AssortmentIndex {
  venueSlug: string;
  assortmentId?: string;
  loadingStrategy?: string;
  primaryLanguage?: string;
  currency?: string;
  categories: AssortmentCategory[];
}

export interface CategoryPage {
  venueSlug: string;
  categorySlug: string;
  currency: string;
  items: Product[];
}

export interface VenueContent {
  vendor: VendorId;
  slug: string;
  raw: unknown;
}

export interface SearchVenuesInput {
  query: string;
  lat: number;
  lon: number;
}

export interface DiscoverVenuesInput {
  lat: number;
  lon: number;
}
```

- [ ] **Step 6: Create `packages/vendors/core/src/vendor.ts`**

```ts
import type {
  AssortmentIndex,
  CategoryPage,
  DiscoverVenuesInput,
  SearchVenuesInput,
  Venue,
  VenueContent,
  VendorId,
} from './types.js';

export interface Vendor {
  readonly id: VendorId;
  readonly displayName: string;
  readonly defaultCurrency: string;

  searchVenues(input: SearchVenuesInput): Promise<Venue[]>;
  discoverVenues(input: DiscoverVenuesInput): Promise<Venue[]>;
  getVenueContent(slug: string): Promise<VenueContent>;
  getAssortmentIndex(slug: string): Promise<AssortmentIndex>;
  getCategoryItems(venueSlug: string, categorySlug: string): Promise<CategoryPage>;
}
```

- [ ] **Step 7: Create `packages/vendors/core/src/registry.ts`**

```ts
import type { Vendor } from './vendor.js';
import type { VendorId } from './types.js';

export class VendorRegistry {
  private readonly byId = new Map<VendorId, Vendor>();

  constructor(vendors: Vendor[]) {
    for (const v of vendors) {
      if (this.byId.has(v.id)) {
        throw new Error(`Duplicate vendor id: ${v.id}`);
      }
      this.byId.set(v.id, v);
    }
  }

  get(id: VendorId): Vendor {
    const v = this.byId.get(id);
    if (!v) throw new Error(`Vendor not registered: ${id}`);
    return v;
  }

  has(id: VendorId): boolean {
    return this.byId.has(id);
  }

  list(): Vendor[] {
    return [...this.byId.values()];
  }

  ids(): VendorId[] {
    return [...this.byId.keys()];
  }
}

export function createRegistry(vendors: Vendor[]): VendorRegistry {
  return new VendorRegistry(vendors);
}
```

- [ ] **Step 8: Create `packages/vendors/core/src/index.ts`**

```ts
export * from './types.js';
export * from './vendor.js';
export * from './registry.js';
export * from './errors.js';
```

---

## Task 5: `@market/vendor-wolt` package (port existing client)

**Purpose:** Move `.legacy/src/wolt/client.ts` + wolt-specific config into its own package, wrapped as a `Vendor` implementation. Keep the HTTP logic byte-for-byte identical; only change imports and the shape returned from the factory.

**Files:**
- Create: `packages/vendors/wolt/package.json`
- Create: `packages/vendors/wolt/tsconfig.json`
- Create: `packages/vendors/wolt/eslint.config.js`
- Create: `packages/vendors/wolt/src/config.ts`
- Create: `packages/vendors/wolt/src/client.ts`
- Create: `packages/vendors/wolt/src/vendor.ts`
- Create: `packages/vendors/wolt/src/index.ts`

**Source reference:** `.legacy/src/wolt/client.ts` (full file), `.legacy/src/config.ts` (wolt-specific fields only).

- [ ] **Step 1: Create `packages/vendors/wolt/package.json`**

```json
{
  "name": "@market/vendor-wolt",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@market/vendor-core": "workspace:*",
    "undici": "^6.19.8"
  },
  "devDependencies": {
    "@market/config": "workspace:*",
    "madge": "^8.0.0",
    "rimraf": "^6.0.1",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create `packages/vendors/wolt/tsconfig.json`**

```jsonc
{
  "extends": "@market/config/tsconfig/package",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/vendors/wolt/eslint.config.js`**

```js
import node from '@market/config/eslint/node';
import boundaries from '@market/config/eslint/boundaries';

export default [...node, ...boundaries];
```

- [ ] **Step 4: Create `packages/vendors/wolt/src/config.ts`**

This is a factory-arg shape, not a process.env read — config flows in from `apps/api`.

```ts
export interface WoltConfig {
  restaurantApi: string;
  consumerApi: string;
  userAgent: string;
  language: string;
  defaultLat: number;
  defaultLon: number;
}

export const WOLT_DEFAULTS: Readonly<WoltConfig> = Object.freeze({
  restaurantApi: 'https://restaurant-api.wolt.com',
  consumerApi: 'https://consumer-api.wolt.com',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  language: 'en',
  defaultLat: 41.7151,
  defaultLon: 44.8271,
});
```

- [ ] **Step 5: Create `packages/vendors/wolt/src/client.ts`**

Port of `.legacy/src/wolt/client.ts`. Changes vs. legacy:
- Remove the top-level `import { CONFIG }` — config is passed into the factory (see `vendor.ts`) and captured in a closure for each `client` call.
- Remove the local `VenueSummary`, `AssortmentCategory`, `AssortmentItem`, `VenueAssortmentIndex`, `CategoryItemsPage` interfaces. Import the shared shapes from `@market/vendor-core` instead, mapping to `Venue`, `AssortmentCategory`, `Product`, `AssortmentIndex`, `CategoryPage`, `VenueContent`.
- `normalizeVenue` → return `Venue` with `vendor: 'wolt'` set.
- `normalizeItem` → return `Product` with `vendor: 'wolt'` set, `gtin` instead of `barcodeGtin`.
- Keep all HTTP semantics (headers, timeouts, path construction, error strings) unchanged.

Create the file with this content:

```ts
import { request } from 'undici';
import type {
  AssortmentCategory,
  AssortmentIndex,
  CategoryPage,
  Product,
  Venue,
  VenueContent,
} from '@market/vendor-core';
import type { WoltConfig } from './config.js';

function headers(config: WoltConfig): Record<string, string> {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': config.userAgent,
    platform: 'Web',
    'app-language': config.language,
    'client-version': '1.16.93',
    clientversionnumber: '1.16.93',
    // base64 of "¤1,234.56" — Wolt's generic currency format hint
    'app-currency-format': 'wqQxLDIzNC41Ng==',
  };
}

async function getJson(url: string, config: WoltConfig): Promise<unknown> {
  const { statusCode, body } = await request(url, {
    method: 'GET',
    headers: headers(config),
    bodyTimeout: 30_000,
    headersTimeout: 30_000,
  });
  const text = await body.text();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Wolt GET ${url} → ${statusCode}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function postJson(url: string, payload: unknown, config: WoltConfig): Promise<unknown> {
  const { statusCode, body } = await request(url, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(payload),
    bodyTimeout: 30_000,
    headersTimeout: 30_000,
  });
  const text = await body.text();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Wolt POST ${url} → ${statusCode}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

function normalizeVenue(v: Record<string, unknown> | null): Venue | null {
  if (!v || typeof v !== 'object' || !('slug' in v)) return null;
  const loc = (v as { location?: { coordinates?: number[] } }).location?.coordinates;
  const get = <K extends string>(key: K): unknown => (v as Record<string, unknown>)[key];
  const rating = get('rating') as { score?: number; volume?: number } | undefined;
  const estimateRange = get('estimate_range') as { min: number; max: number } | undefined;
  const icon = get('icon') as { url?: string } | string | undefined;
  const brand = get('brand_image') as { url?: string } | string | undefined;
  return {
    vendor: 'wolt',
    id: String(get('id') ?? get('slug')),
    slug: String(get('slug')),
    name: (get('name') as string) ?? String(get('slug')),
    shortDescription:
      (get('short_description') as string | undefined) ??
      ((get('short_description_v2') as { text?: string } | undefined)?.text),
    address: get('address') as string | undefined,
    city: get('city') as string | undefined,
    country: get('country') as string | undefined,
    currency: get('currency') as string | undefined,
    location:
      Array.isArray(loc) && loc.length >= 2 ? { lon: loc[0] as number, lat: loc[1] as number } : undefined,
    rating: rating ? { score: rating.score, volume: rating.volume } : undefined,
    priceRange: get('price_range') as number | undefined,
    deliveryPriceInt: get('delivery_price_int') as number | undefined,
    deliveryPriceText: get('delivery_price') as string | undefined,
    estimateMinutes: get('estimate') as number | undefined,
    estimateRange: estimateRange ? { min: estimateRange.min, max: estimateRange.max } : undefined,
    online: get('online') as boolean | undefined,
    tags: get('tags') as string[] | undefined,
    categories: get('categories') as string[] | undefined,
    productLine: get('product_line') as Venue['productLine'],
    iconUrl: typeof icon === 'object' ? icon?.url : (icon as string | undefined),
    brandImageUrl: typeof brand === 'object' ? brand?.url : (brand as string | undefined),
    raw: v,
  };
}

function extractVenuesFromPages(data: unknown): Venue[] {
  const out: Venue[] = [];
  const seen = new Set<string>();
  const sections = (data as { sections?: unknown[] })?.sections ?? [];
  for (const sec of sections) {
    const items = (sec as { items?: unknown[] })?.items ?? [];
    for (const it of items) {
      const v = (it as { venue?: Record<string, unknown> }).venue;
      if (!v) continue;
      const n = normalizeVenue(v);
      if (n && !seen.has(n.slug)) {
        seen.add(n.slug);
        out.push(n);
      }
    }
  }
  return out;
}

function normalizeCategory(c: Record<string, unknown>): AssortmentCategory {
  const subs = (c.subcategories ?? []) as Record<string, unknown>[];
  const images = c.images as Array<{ url?: string }> | undefined;
  return {
    id: String(c.id),
    name: (c.name as string) ?? String(c.slug),
    slug: String(c.slug ?? c.id),
    description: (c.description as string) || undefined,
    parentId: c.parent_id ? String(c.parent_id) : undefined,
    imageUrl: images?.[0]?.url,
    itemIds: ((c.item_ids as unknown[]) ?? []).map((x) => String(x)),
    subcategories: subs.map(normalizeCategory),
  };
}

function normalizeItem(
  raw: Record<string, unknown>,
  currency: string,
  categorySlug: string | undefined,
): Product {
  const unitPrice = raw.unit_price as { price: number; unit: string } | undefined;
  const images = (raw.images ?? []) as Array<{ url?: string }>;
  return {
    vendor: 'wolt',
    id: String(raw.id),
    name: (raw.name as string) ?? '',
    description: (raw.description as string) || undefined,
    price: Number(raw.price ?? 0),
    originalPrice: raw.original_price != null ? Number(raw.original_price) : undefined,
    currency,
    unitPrice: unitPrice ? { price: Number(unitPrice.price), unit: String(unitPrice.unit) } : undefined,
    unitInfo: (raw.unit_info as string) ?? undefined,
    gtin: (raw.barcode_gtin as string | null | undefined) ?? null,
    images: images.map((i) => i.url).filter((u): u is string => !!u),
    categoryId: raw.category_id ? String(raw.category_id) : undefined,
    categorySlug,
    tags: raw.tags as string[] | undefined,
    disabled: !!raw.disabled_info,
    raw,
  };
}

export interface WoltClient {
  discoverVenues(lat?: number, lon?: number): Promise<Venue[]>;
  searchVenues(q: string, lat?: number, lon?: number): Promise<Venue[]>;
  getVenueContent(slug: string): Promise<VenueContent>;
  getAssortmentIndex(slug: string): Promise<AssortmentIndex>;
  getCategoryItems(venueSlug: string, categorySlug: string, currency?: string): Promise<CategoryPage>;
}

export function createWoltClient(config: WoltConfig): WoltClient {
  return {
    async discoverVenues(lat = config.defaultLat, lon = config.defaultLon) {
      const url = `${config.restaurantApi}/v1/pages/restaurants?lat=${lat}&lon=${lon}`;
      return extractVenuesFromPages(await getJson(url, config));
    },
    async searchVenues(q, lat = config.defaultLat, lon = config.defaultLon) {
      const url = `${config.restaurantApi}/v1/pages/search`;
      return extractVenuesFromPages(await postJson(url, { q, target: null, lat, lon }, config));
    },
    async getVenueContent(slug) {
      const url = `${config.consumerApi}/consumer-api/venue-content-api/v3/web/venue-content/slug/${encodeURIComponent(slug)}`;
      const raw = await getJson(url, config);
      return { vendor: 'wolt', slug, raw };
    },
    async getAssortmentIndex(slug) {
      const url = `${config.consumerApi}/consumer-api/consumer-assortment/v1/venues/slug/${encodeURIComponent(slug)}/assortment`;
      const data = (await getJson(url, config)) as {
        assortment_id?: string;
        loading_strategy?: string;
        primary_language?: string;
        currency?: string;
        categories?: Record<string, unknown>[];
      };
      return {
        venueSlug: slug,
        assortmentId: data.assortment_id,
        loadingStrategy: data.loading_strategy,
        primaryLanguage: data.primary_language,
        currency: data.currency,
        categories: (data.categories ?? []).map(normalizeCategory),
      };
    },
    async getCategoryItems(venueSlug, categorySlug, currency = 'GEL') {
      const url = `${config.consumerApi}/consumer-api/consumer-assortment/v1/venues/slug/${encodeURIComponent(venueSlug)}/assortment/categories/slug/${encodeURIComponent(categorySlug)}?language=${encodeURIComponent(config.language)}`;
      const data = (await getJson(url, config)) as {
        currency?: string;
        items?: Record<string, unknown>[];
      };
      const resolvedCurrency = data.currency ?? currency;
      const items = (data.items ?? []).map((raw) => normalizeItem(raw, resolvedCurrency, categorySlug));
      return { venueSlug, categorySlug, currency: resolvedCurrency, items };
    },
  };
}
```

- [ ] **Step 6: Create `packages/vendors/wolt/src/vendor.ts`**

```ts
import type { Vendor } from '@market/vendor-core';
import { createWoltClient } from './client.js';
import { WOLT_DEFAULTS, type WoltConfig } from './config.js';

export interface CreateWoltVendorOptions {
  config?: Partial<WoltConfig>;
}

export function createWoltVendor(options: CreateWoltVendorOptions = {}): Vendor {
  const config: WoltConfig = { ...WOLT_DEFAULTS, ...options.config };
  const client = createWoltClient(config);
  return {
    id: 'wolt',
    displayName: 'Wolt',
    defaultCurrency: 'GEL',
    searchVenues: ({ query, lat, lon }) => client.searchVenues(query, lat, lon),
    discoverVenues: ({ lat, lon }) => client.discoverVenues(lat, lon),
    getVenueContent: (slug) => client.getVenueContent(slug),
    getAssortmentIndex: (slug) => client.getAssortmentIndex(slug),
    getCategoryItems: (venueSlug, categorySlug) => client.getCategoryItems(venueSlug, categorySlug),
  };
}
```

- [ ] **Step 7: Create `packages/vendors/wolt/src/index.ts`**

```ts
export { createWoltVendor, type CreateWoltVendorOptions } from './vendor.js';
export { WOLT_DEFAULTS, type WoltConfig } from './config.js';
```

---

## Task 6: Vendor stub packages (glovo, bolt-food, europroduct, goodwill)

**Purpose:** Create stub `Vendor` implementations that throw `NotImplementedError` for every method, so the registry + routing surface works end-to-end with zero real traffic. Adding a real vendor later is a one-file edit per stub.

**Files per stub** (create 4 identical package structures differing only in `id`, `displayName`, `defaultCurrency`, folder name):
- Create: `packages/vendors/<slug>/package.json`
- Create: `packages/vendors/<slug>/tsconfig.json`
- Create: `packages/vendors/<slug>/eslint.config.js`
- Create: `packages/vendors/<slug>/src/vendor.ts`
- Create: `packages/vendors/<slug>/src/index.ts`

Stub matrix:

| Folder | `id` | package name | `displayName` | `defaultCurrency` | Factory name |
|---|---|---|---|---|---|
| `glovo` | `glovo` | `@market/vendor-glovo` | `Glovo` | `GEL` | `createGlovoVendor` |
| `bolt-food` | `bolt-food` | `@market/vendor-bolt-food` | `Bolt Food` | `GEL` | `createBoltFoodVendor` |
| `europroduct` | `europroduct` | `@market/vendor-europroduct` | `Europroduct` | `GEL` | `createEuroproductVendor` |
| `goodwill` | `goodwill` | `@market/vendor-goodwill` | `Goodwill` | `GEL` | `createGoodwillVendor` |

- [ ] **Step 1: For each stub in the matrix, create `package.json`**

Replace `<PKGNAME>` and `<SLUG>` with values from the matrix.

```json
{
  "name": "<PKGNAME>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@market/vendor-core": "workspace:*"
  },
  "devDependencies": {
    "@market/config": "workspace:*",
    "madge": "^8.0.0",
    "rimraf": "^6.0.1",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: For each stub, create `tsconfig.json`**

```jsonc
{
  "extends": "@market/config/tsconfig/package",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: For each stub, create `eslint.config.js`**

```js
import node from '@market/config/eslint/node';
import boundaries from '@market/config/eslint/boundaries';

export default [...node, ...boundaries];
```

- [ ] **Step 4: For each stub, create `src/vendor.ts`**

Replace `<ID>`, `<DISPLAY>`, `<CURRENCY>`, `<FACTORY>` accordingly.

```ts
import type { Vendor } from '@market/vendor-core';
import { NotImplementedError } from '@market/vendor-core';

const ID = '<ID>' as const;

export function <FACTORY>(): Vendor {
  const nope = (method: string): never => {
    throw new NotImplementedError(ID, method);
  };
  return {
    id: ID,
    displayName: '<DISPLAY>',
    defaultCurrency: '<CURRENCY>',
    searchVenues: async () => nope('searchVenues'),
    discoverVenues: async () => nope('discoverVenues'),
    getVenueContent: async () => nope('getVenueContent'),
    getAssortmentIndex: async () => nope('getAssortmentIndex'),
    getCategoryItems: async () => nope('getCategoryItems'),
  };
}
```

- [ ] **Step 5: For each stub, create `src/index.ts`**

Replace `<FACTORY>` accordingly.

```ts
export { <FACTORY> } from './vendor.js';
```

---

## Task 7: `@market/contracts` package

**Purpose:** Define Valibot request/response schemas for every api endpoint. These are the single source of truth for api validation, web TanStack Query typing, and mcp tool input shapes.

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/eslint.config.js`
- Create: `packages/contracts/src/common.ts`
- Create: `packages/contracts/src/venues.ts`
- Create: `packages/contracts/src/catalog.ts`
- Create: `packages/contracts/src/shopping-list.ts`
- Create: `packages/contracts/src/admin.ts`
- Create: `packages/contracts/src/routes.ts`
- Create: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create `packages/contracts/package.json`**

```json
{
  "name": "@market/contracts",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "valibot": "^1.0.0-beta.9"
  },
  "devDependencies": {
    "@market/config": "workspace:*",
    "madge": "^8.0.0",
    "rimraf": "^6.0.1",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create `packages/contracts/tsconfig.json`**

```jsonc
{
  "extends": "@market/config/tsconfig/package",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/contracts/eslint.config.js`**

```js
import node from '@market/config/eslint/node';
import boundaries from '@market/config/eslint/boundaries';

export default [...node, ...boundaries];
```

- [ ] **Step 4: Create `packages/contracts/src/common.ts`**

```ts
import * as v from 'valibot';

export const VendorIdSchema = v.picklist([
  'wolt',
  'glovo',
  'bolt-food',
  'europroduct',
  'goodwill',
] as const);
export type VendorId = v.InferOutput<typeof VendorIdSchema>;

export const ProductLineSchema = v.picklist([
  'restaurant',
  'store',
  'grocery',
  'pharmacy',
  'other',
] as const);
export type ProductLine = v.InferOutput<typeof ProductLineSchema>;

export const PriceMinorSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

export const CoordinatesSchema = v.object({
  lat: v.number(),
  lon: v.number(),
});
```

- [ ] **Step 5: Create `packages/contracts/src/venues.ts`**

```ts
import * as v from 'valibot';
import { CoordinatesSchema, PriceMinorSchema, ProductLineSchema, VendorIdSchema } from './common.js';

export const VenueSchema = v.object({
  vendor: VendorIdSchema,
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  shortDescription: v.optional(v.string()),
  address: v.optional(v.string()),
  currency: v.optional(v.string()),
  location: v.optional(CoordinatesSchema),
  productLine: v.optional(ProductLineSchema),
  online: v.optional(v.boolean()),
  deliveryPriceInt: v.optional(PriceMinorSchema),
  deliveryPriceText: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
});
export type Venue = v.InferOutput<typeof VenueSchema>;

export const ListVenuesQuerySchema = v.object({
  q: v.optional(v.string()),
  vendor: v.optional(VendorIdSchema),
  productLine: v.optional(ProductLineSchema),
  online: v.optional(v.boolean()),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2000)), 200),
});
export type ListVenuesQuery = v.InferOutput<typeof ListVenuesQuerySchema>;

export const ListVenuesResponseSchema = v.object({
  venues: v.array(VenueSchema),
});
export type ListVenuesResponse = v.InferOutput<typeof ListVenuesResponseSchema>;

export const GetVenueParamsSchema = v.object({
  vendor: VendorIdSchema,
  slug: v.string(),
});
export type GetVenueParams = v.InferOutput<typeof GetVenueParamsSchema>;

export const GetVenueResponseSchema = v.object({
  venue: VenueSchema,
  content: v.optional(v.unknown()),
});
export type GetVenueResponse = v.InferOutput<typeof GetVenueResponseSchema>;

export const RefreshAssortmentParamsSchema = GetVenueParamsSchema;
export const RefreshAssortmentResponseSchema = v.object({
  slug: v.string(),
  categories: v.number(),
  items: v.number(),
  errors: v.number(),
});
export type RefreshAssortmentResponse = v.InferOutput<typeof RefreshAssortmentResponseSchema>;
```

- [ ] **Step 6: Create `packages/contracts/src/catalog.ts`**

```ts
import * as v from 'valibot';
import { PriceMinorSchema, VendorIdSchema } from './common.js';

export const SearchModeSchema = v.picklist(['keyword', 'semantic', 'hybrid'] as const);
export type SearchMode = v.InferOutput<typeof SearchModeSchema>;

export const SearchItemsQuerySchema = v.object({
  q: v.pipe(v.string(), v.minLength(1)),
  vendor: v.optional(VendorIdSchema),
  mode: v.optional(SearchModeSchema, 'hybrid'),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)), 50),
});
export type SearchItemsQuery = v.InferOutput<typeof SearchItemsQuerySchema>;

export const ItemResultSchema = v.object({
  id: v.string(),
  vendor: VendorIdSchema,
  venueSlug: v.string(),
  venueName: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  priceMinor: PriceMinorSchema,
  currency: v.string(),
  gtin: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  score: v.optional(v.number()),
});
export type ItemResult = v.InferOutput<typeof ItemResultSchema>;

export const SearchItemsResponseSchema = v.object({
  items: v.array(ItemResultSchema),
  mode: SearchModeSchema,
});
export type SearchItemsResponse = v.InferOutput<typeof SearchItemsResponseSchema>;

export const CatalogStatsResponseSchema = v.object({
  venues: v.number(),
  categories: v.number(),
  items: v.number(),
  itemsWithEmbedding: v.number(),
  venuesWithAssortment: v.number(),
});
export type CatalogStatsResponse = v.InferOutput<typeof CatalogStatsResponseSchema>;
```

- [ ] **Step 7: Create `packages/contracts/src/shopping-list.ts`**

```ts
import * as v from 'valibot';
import { PriceMinorSchema, VendorIdSchema } from './common.js';

export const ShoppingStrategySchema = v.picklist([
  'cheapest-per-item',
  'single-store',
  'both',
] as const);
export type ShoppingStrategy = v.InferOutput<typeof ShoppingStrategySchema>;

export const ShoppingLineInputSchema = v.object({
  query: v.pipe(v.string(), v.minLength(1)),
  quantity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
export type ShoppingLineInput = v.InferOutput<typeof ShoppingLineInputSchema>;

export const BuildShoppingListBodySchema = v.object({
  items: v.pipe(v.array(ShoppingLineInputSchema), v.minLength(1)),
  strategy: ShoppingStrategySchema,
  vendor: v.optional(VendorIdSchema),
  venueSlugs: v.optional(v.array(v.string())),
  includeOffline: v.optional(v.boolean(), false),
});
export type BuildShoppingListBody = v.InferOutput<typeof BuildShoppingListBodySchema>;

export const ItemCandidateSchema = v.object({
  venueSlug: v.string(),
  venueName: v.string(),
  itemId: v.string(),
  itemName: v.string(),
  priceMinor: PriceMinorSchema,
  currency: v.string(),
  unitInfo: v.optional(v.string()),
  deliveryPriceInt: v.optional(PriceMinorSchema),
  online: v.boolean(),
});
export type ItemCandidate = v.InferOutput<typeof ItemCandidateSchema>;

export const ShoppingPlanLineSchema = v.object({
  query: v.string(),
  quantity: v.number(),
  chosen: v.optional(ItemCandidateSchema),
  lineTotalMinor: v.optional(PriceMinorSchema),
  unmet: v.optional(v.literal(true)),
  alternatives: v.optional(v.array(ItemCandidateSchema)),
});
export type ShoppingPlanLine = v.InferOutput<typeof ShoppingPlanLineSchema>;

export const CheapestPerItemPlanSchema = v.object({
  strategy: v.literal('cheapest-per-item'),
  lines: v.array(ShoppingPlanLineSchema),
  uniqueVenues: v.array(v.string()),
  itemsSubtotalMinor: PriceMinorSchema,
  deliverySubtotalMinor: PriceMinorSchema,
  grandTotalMinor: PriceMinorSchema,
  currency: v.string(),
  unmet: v.array(v.string()),
});
export type CheapestPerItemPlan = v.InferOutput<typeof CheapestPerItemPlanSchema>;

export const SingleStorePlanSchema = v.object({
  strategy: v.literal('single-store'),
  venueSlug: v.string(),
  venueName: v.string(),
  itemsSubtotalMinor: PriceMinorSchema,
  deliveryFeeMinor: PriceMinorSchema,
  grandTotalMinor: PriceMinorSchema,
  currency: v.string(),
  lines: v.array(ShoppingPlanLineSchema),
  unmet: v.array(v.string()),
});
export type SingleStorePlan = v.InferOutput<typeof SingleStorePlanSchema>;

export const BuildShoppingListResponseSchema = v.object({
  cheapestPerItem: v.optional(CheapestPerItemPlanSchema),
  singleStore: v.optional(SingleStorePlanSchema),
});
export type BuildShoppingListResponse = v.InferOutput<typeof BuildShoppingListResponseSchema>;
```

- [ ] **Step 8: Create `packages/contracts/src/admin.ts`**

```ts
import * as v from 'valibot';
import { VendorIdSchema } from './common.js';

export const CrawlBodySchema = v.object({
  vendor: v.optional(VendorIdSchema),
  venueSlugs: v.optional(v.array(v.string())),
  venuesOnly: v.optional(v.boolean(), false),
});
export type CrawlBody = v.InferOutput<typeof CrawlBodySchema>;

export const CrawlResponseSchema = v.object({
  vendor: v.optional(VendorIdSchema),
  venues: v.number(),
  items: v.number(),
  errors: v.number(),
});
export type CrawlResponse = v.InferOutput<typeof CrawlResponseSchema>;
```

- [ ] **Step 9: Create `packages/contracts/src/routes.ts`**

```ts
export const ROUTES = {
  venues: {
    list: '/v1/venues',
    get: (vendor: string, slug: string) => `/v1/venues/${vendor}/${slug}`,
    refreshAssortment: (vendor: string, slug: string) =>
      `/v1/venues/${vendor}/${slug}/refresh-assortment`,
  },
  catalog: {
    search: '/v1/catalog/search',
    stats: '/v1/catalog/stats',
  },
  shoppingList: '/v1/shopping-list',
  admin: {
    crawl: '/v1/admin/crawl',
  },
} as const;
```

- [ ] **Step 10: Create `packages/contracts/src/index.ts`**

```ts
export * from './common.js';
export * from './venues.js';
export * from './catalog.js';
export * from './shopping-list.js';
export * from './admin.js';
export * from './routes.js';
```

---

## Task 8: `@market/ui` package (shadcn starter components)

**Purpose:** Shared React UI kit consumed by `apps/web`. Uses Tailwind + Radix primitives via shadcn/ui's copy-paste-ownership style. Only a small initial set — more components get added when `apps/web` needs them.

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/eslint.config.js`
- Create: `packages/ui/tailwind.config.js`
- Create: `packages/ui/src/styles/globals.css`
- Create: `packages/ui/src/lib/cn.ts`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/input.tsx`
- Create: `packages/ui/src/components/card.tsx`
- Create: `packages/ui/src/components/skeleton.tsx`
- Create: `packages/ui/src/components/command.tsx`
- Create: `packages/ui/src/components/sonner.tsx`
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@market/ui",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./styles.css": "./src/styles/globals.css",
    "./tailwind-preset": "./tailwind.config.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.0.4",
    "lucide-react": "^0.460.0",
    "sonner": "^1.7.0",
    "tailwind-merge": "^2.5.4"
  },
  "peerDependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "@market/config": "workspace:*",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "madge": "^8.0.0",
    "rimraf": "^6.0.1",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```jsonc
{
  "extends": "@market/config/tsconfig/react",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "composite": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Create `packages/ui/eslint.config.js`**

```js
import react from '@market/config/eslint/react';
import boundaries from '@market/config/eslint/boundaries';

export default [...react, ...boundaries];
```

- [ ] **Step 4: Create `packages/ui/tailwind.config.js`** (exported as preset for `apps/web`)

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Create `packages/ui/src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 6: Create `packages/ui/src/lib/cn.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Create `packages/ui/src/components/button.tsx`**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-muted',
        ghost: 'hover:bg-muted hover:text-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
```

- [ ] **Step 8: Create `packages/ui/src/components/input.tsx`**

```tsx
import * as React from 'react';
import { cn } from '../lib/cn.js';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] **Step 9: Create `packages/ui/src/components/card.tsx`**

```tsx
import * as React from 'react';
import { cn } from '../lib/cn.js';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';
```

- [ ] **Step 10: Create `packages/ui/src/components/skeleton.tsx`**

```tsx
import type * as React from 'react';
import { cn } from '../lib/cn.js';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
```

- [ ] **Step 11: Create `packages/ui/src/components/command.tsx`**

```tsx
import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { cn } from '../lib/cn.js';

export const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

export const CommandInput = CommandPrimitive.Input;
export const CommandList = CommandPrimitive.List;
export const CommandEmpty = CommandPrimitive.Empty;
export const CommandGroup = CommandPrimitive.Group;
export const CommandItem = CommandPrimitive.Item;
```

- [ ] **Step 12: Create `packages/ui/src/components/sonner.tsx`**

```tsx
import { Toaster as SonnerToaster, toast } from 'sonner';

export function Toaster() {
  return <SonnerToaster position="top-right" richColors />;
}

export { toast };
```

- [ ] **Step 13: Create `packages/ui/src/index.ts`**

```ts
export * from './components/button.js';
export * from './components/input.js';
export * from './components/card.js';
export * from './components/skeleton.js';
export * from './components/command.js';
export * from './components/sonner.js';
export { cn } from './lib/cn.js';
```

---

## Task 9: `apps/api` scaffold — package.json, tsconfig, environment.ts, drizzle config

**Purpose:** Create the api app shell with `environment.ts` fail-fast validation wired up before any other module depends on env.

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/eslint.config.js`
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/environment.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@market/api",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean": "rimraf dist",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "crawl": "tsx src/crawler/crawl.ts"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.1",
    "@fastify/type-provider-standard-schema": "^0.1.0",
    "@market/contracts": "workspace:*",
    "@market/vendor-bolt-food": "workspace:*",
    "@market/vendor-core": "workspace:*",
    "@market/vendor-europroduct": "workspace:*",
    "@market/vendor-glovo": "workspace:*",
    "@market/vendor-goodwill": "workspace:*",
    "@market/vendor-wolt": "workspace:*",
    "drizzle-orm": "^0.36.4",
    "fastify": "^5.1.0",
    "pg": "^8.13.1",
    "undici": "^6.19.8",
    "valibot": "^1.0.0-beta.9"
  },
  "devDependencies": {
    "@market/config": "workspace:*",
    "@types/node": "^22.9.0",
    "@types/pg": "^8.11.10",
    "drizzle-kit": "^0.28.1",
    "madge": "^8.0.0",
    "rimraf": "^6.0.1",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```jsonc
{
  "extends": "@market/config/tsconfig/node",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `apps/api/eslint.config.js`**

```js
import node from '@market/config/eslint/node';
import boundaries from '@market/config/eslint/boundaries';

export default [...node, ...boundaries];
```

- [ ] **Step 4: Create `apps/api/drizzle.config.ts`**

```ts
// eslint-disable-next-line no-restricted-properties, no-restricted-syntax
const dbUrl = process.env.DATABASE_URL ?? 'postgres://market:market@localhost:5432/market';

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: dbUrl },
  strict: true,
  verbose: true,
} satisfies Config;
```

- [ ] **Step 5: Create `apps/api/src/environment.ts`**

```ts
import * as v from 'valibot';

const NumberFromString = v.pipe(
  v.string(),
  v.transform((s) => Number(s)),
  v.number(),
  v.integer(),
);

const CsvList = v.pipe(
  v.string(),
  v.transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  ),
  v.array(v.string()),
);

const VendorId = v.picklist(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill'] as const);

const Schema = v.pipe(
  v.object({
    NODE_ENV: v.picklist(['development', 'production', 'test'] as const),
    API_PORT: v.pipe(NumberFromString, v.minValue(1), v.maxValue(65535)),
    API_TOKEN: v.pipe(v.string(), v.minLength(8)),
    DATABASE_URL: v.pipe(v.string(), v.url()),
    EMBEDDING_WORKER: v.picklist(['on', 'off'] as const),
    ENABLED_VENDORS: v.pipe(CsvList, v.array(VendorId)),
    EMBEDDER: v.picklist(['voyage', 'openai', 'ollama', 'cohere'] as const),
    VOYAGE_API_KEY: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    OLLAMA_BASE_URL: v.optional(v.pipe(v.string(), v.url())),
    COHERE_API_KEY: v.optional(v.string()),
    WOLT_LAT: NumberFromString,
    WOLT_LON: NumberFromString,
  }),
  v.forward(
    v.partialCheck(
      [
        ['EMBEDDER'],
        ['VOYAGE_API_KEY'],
        ['OPENAI_API_KEY'],
        ['OLLAMA_BASE_URL'],
        ['COHERE_API_KEY'],
      ],
      (input) => {
        switch (input.EMBEDDER) {
          case 'voyage':
            return !!input.VOYAGE_API_KEY;
          case 'openai':
            return !!input.OPENAI_API_KEY;
          case 'cohere':
            return !!input.COHERE_API_KEY;
          case 'ollama':
            return !!input.OLLAMA_BASE_URL;
        }
      },
      'Selected EMBEDDER requires its corresponding API key / base URL',
    ),
    ['EMBEDDER'],
  ),
);

export type Environment = v.InferOutput<typeof Schema>;

function parseEnv(): Environment {
  // This is the one file allowed to read process.env directly.
  // eslint-disable-next-line no-restricted-properties, no-restricted-syntax
  const result = v.safeParse(Schema, process.env);
  if (result.success) return Object.freeze(result.output);
  const issues = result.issues
    .map((i) => {
      const path = (i.path ?? []).map((p) => (p as { key?: string }).key ?? '').join('.');
      return `  - ${path || '(root)'}: ${i.message}`;
    })
    .join('\n');
  console.error(`[@market/api] invalid environment:\n${issues}`);
  process.exit(1);
}

export const environment = parseEnv();
```

---

## Task 10: `apps/api` db schema + client

**Purpose:** Define the Postgres schema via Drizzle and create the pg client. No migrations generated yet — that happens in Task 23 after all code exists.

**Files:**
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/types.ts`

**Source reference for the schema:** the full drizzle schema is written out in `docs/superpowers/specs/2026-04-15-market-monorepo-design.md §4.3`. Copy that code block verbatim into `apps/api/src/db/schema.ts`, then add the additional exports below.

- [ ] **Step 1: Create `apps/api/src/db/schema.ts`**

Open `docs/superpowers/specs/2026-04-15-market-monorepo-design.md`, locate section §4.3 (header `### 4.3 Schema (Drizzle, Postgres)`), and copy the entire TypeScript code block (from `import { pgTable, ...` through the last closing `}));`) into `apps/api/src/db/schema.ts`. This is the authoritative definition.

After pasting, append these type exports at the end of the file:

```ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type VenueRow = InferSelectModel<typeof venues>;
export type VenueInsert = InferInsertModel<typeof venues>;
export type CategoryRow = InferSelectModel<typeof categories>;
export type CategoryInsert = InferInsertModel<typeof categories>;
export type ItemRow = InferSelectModel<typeof items>;
export type ItemInsert = InferInsertModel<typeof items>;
export type ItemEmbeddingRow = InferSelectModel<typeof itemEmbeddings>;
export type ItemEmbeddingInsert = InferInsertModel<typeof itemEmbeddings>;
```

- [ ] **Step 2: Create `apps/api/src/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { environment } from '../environment.js';
import * as schema from './schema.js';

const { Pool } = pg;

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let pool: pg.Pool | null = null;
let db: DbClient | null = null;

export function getDb(): DbClient {
  if (db) return db;
  pool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  db = drizzle(pool, { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
```

- [ ] **Step 3: Create `apps/api/src/db/types.ts`**

```ts
export type {
  VenueRow,
  VenueInsert,
  CategoryRow,
  CategoryInsert,
  ItemRow,
  ItemInsert,
  ItemEmbeddingRow,
  ItemEmbeddingInsert,
} from './schema.js';
```

---

## Task 11: `apps/api` embedder interface + providers

**Purpose:** Pluggable `Embedder` interface with four implementations (Voyage, OpenAI, Ollama, Cohere). Selection driven by `environment.EMBEDDER`. All providers normalize to 1024 dims.

**Files:**
- Create: `apps/api/src/embeddings/embedder.ts`
- Create: `apps/api/src/embeddings/voyage.ts`
- Create: `apps/api/src/embeddings/openai.ts`
- Create: `apps/api/src/embeddings/ollama.ts`
- Create: `apps/api/src/embeddings/cohere.ts`
- Create: `apps/api/src/embeddings/index.ts`

- [ ] **Step 1: Create `apps/api/src/embeddings/embedder.ts`**

```ts
export interface Embedder {
  readonly id: string;
  readonly dimensions: number;
  readonly maxBatch: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_DIMENSIONS = 1024;
```

- [ ] **Step 2: Create `apps/api/src/embeddings/voyage.ts`**

```ts
import { request } from 'undici';
import type { Embedder } from './embedder.js';

export interface VoyageOptions {
  apiKey: string;
  model?: string;
}

export function createVoyageEmbedder(options: VoyageOptions): Embedder {
  const model = options.model ?? 'voyage-3';
  return {
    id: `voyage-${model}`,
    dimensions: 1024,
    maxBatch: 128,
    async embed(texts) {
      if (texts.length === 0) return [];
      const { statusCode, body } = await request('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: texts, model, input_type: 'document' }),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      const raw = await body.text();
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Voyage embeddings ${statusCode}: ${raw.slice(0, 300)}`);
      }
      const parsed = JSON.parse(raw) as { data: Array<{ embedding: number[] }> };
      return parsed.data.map((d) => d.embedding);
    },
  };
}
```

- [ ] **Step 3: Create `apps/api/src/embeddings/openai.ts`**

```ts
import { request } from 'undici';
import type { Embedder } from './embedder.js';

export interface OpenAIOptions {
  apiKey: string;
  model?: string;
}

export function createOpenAIEmbedder(options: OpenAIOptions): Embedder {
  const model = options.model ?? 'text-embedding-3-small';
  return {
    id: `openai-${model}-1024`,
    dimensions: 1024,
    maxBatch: 2048,
    async embed(texts) {
      if (texts.length === 0) return [];
      const { statusCode, body } = await request('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: texts, model, dimensions: 1024 }),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      const raw = await body.text();
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`OpenAI embeddings ${statusCode}: ${raw.slice(0, 300)}`);
      }
      const parsed = JSON.parse(raw) as { data: Array<{ embedding: number[] }> };
      return parsed.data.map((d) => d.embedding);
    },
  };
}
```

- [ ] **Step 4: Create `apps/api/src/embeddings/ollama.ts`**

```ts
import { request } from 'undici';
import type { Embedder } from './embedder.js';

export interface OllamaOptions {
  baseUrl: string;
  model?: string;
}

export function createOllamaEmbedder(options: OllamaOptions): Embedder {
  const model = options.model ?? 'bge-m3';
  return {
    id: `ollama-${model}`,
    dimensions: 1024,
    maxBatch: 32,
    async embed(texts) {
      const out: number[][] = [];
      for (const text of texts) {
        const { statusCode, body } = await request(`${options.baseUrl.replace(/\/$/, '')}/api/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
          bodyTimeout: 60_000,
          headersTimeout: 60_000,
        });
        const raw = await body.text();
        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(`Ollama embeddings ${statusCode}: ${raw.slice(0, 300)}`);
        }
        const parsed = JSON.parse(raw) as { embedding: number[] };
        if (parsed.embedding.length !== 1024) {
          throw new Error(
            `Ollama model ${model} returned ${parsed.embedding.length} dims; expected 1024. Use a compatible model (e.g. bge-m3).`,
          );
        }
        out.push(parsed.embedding);
      }
      return out;
    },
  };
}
```

- [ ] **Step 5: Create `apps/api/src/embeddings/cohere.ts`**

```ts
import { request } from 'undici';
import type { Embedder } from './embedder.js';

export interface CohereOptions {
  apiKey: string;
  model?: string;
}

export function createCohereEmbedder(options: CohereOptions): Embedder {
  const model = options.model ?? 'embed-multilingual-v3.0';
  return {
    id: `cohere-${model}`,
    dimensions: 1024,
    maxBatch: 96,
    async embed(texts) {
      if (texts.length === 0) return [];
      const { statusCode, body } = await request('https://api.cohere.com/v1/embed', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ texts, model, input_type: 'search_document' }),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      const raw = await body.text();
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Cohere embeddings ${statusCode}: ${raw.slice(0, 300)}`);
      }
      const parsed = JSON.parse(raw) as { embeddings: number[][] };
      return parsed.embeddings;
    },
  };
}
```

- [ ] **Step 6: Create `apps/api/src/embeddings/index.ts`**

```ts
import { environment } from '../environment.js';
import type { Embedder } from './embedder.js';
import { createVoyageEmbedder } from './voyage.js';
import { createOpenAIEmbedder } from './openai.js';
import { createOllamaEmbedder } from './ollama.js';
import { createCohereEmbedder } from './cohere.js';

export type { Embedder } from './embedder.js';

let cached: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (cached) return cached;
  switch (environment.EMBEDDER) {
    case 'voyage':
      cached = createVoyageEmbedder({ apiKey: environment.VOYAGE_API_KEY! });
      break;
    case 'openai':
      cached = createOpenAIEmbedder({ apiKey: environment.OPENAI_API_KEY! });
      break;
    case 'ollama':
      cached = createOllamaEmbedder({ baseUrl: environment.OLLAMA_BASE_URL! });
      break;
    case 'cohere':
      cached = createCohereEmbedder({ apiKey: environment.COHERE_API_KEY! });
      break;
  }
  return cached;
}
```

---

## Task 12: `apps/api` vendor registry

**Purpose:** Build the `VendorRegistry` at boot from `environment.ENABLED_VENDORS`, importing every vendor factory lazily so unused vendors don't pay their init cost.

**Files:**
- Create: `apps/api/src/vendor-registry.ts`

- [ ] **Step 1: Create `apps/api/src/vendor-registry.ts`**

```ts
import { createRegistry, VendorRegistry, type Vendor, type VendorId } from '@market/vendor-core';
import { createWoltVendor } from '@market/vendor-wolt';
import { createGlovoVendor } from '@market/vendor-glovo';
import { createBoltFoodVendor } from '@market/vendor-bolt-food';
import { createEuroproductVendor } from '@market/vendor-europroduct';
import { createGoodwillVendor } from '@market/vendor-goodwill';
import { environment } from './environment.js';

function factoryFor(id: VendorId): Vendor {
  switch (id) {
    case 'wolt':
      return createWoltVendor({
        config: { defaultLat: environment.WOLT_LAT, defaultLon: environment.WOLT_LON },
      });
    case 'glovo':
      return createGlovoVendor();
    case 'bolt-food':
      return createBoltFoodVendor();
    case 'europroduct':
      return createEuroproductVendor();
    case 'goodwill':
      return createGoodwillVendor();
  }
}

let cached: VendorRegistry | null = null;

export function getVendorRegistry(): VendorRegistry {
  if (cached) return cached;
  const enabled = environment.ENABLED_VENDORS as VendorId[];
  cached = createRegistry(enabled.map(factoryFor));
  return cached;
}
```

---

## Task 13: `apps/api` catalog service (port `db/store.ts`)

**Purpose:** Replace sqlite repository with a Drizzle-based service. This is the only place in api that touches the DB for catalog reads/writes. Methods map 1:1 to the legacy `Store` class but use Postgres + pgvector, and include hybrid search.

**Files:**
- Create: `apps/api/src/services/catalog.ts`

**Source reference for the hybrid SQL:** `docs/superpowers/specs/2026-04-15-market-monorepo-design.md §4.5`. Copy the SQL template verbatim into the `searchItemsHybrid` method below.

- [ ] **Step 1: Create `apps/api/src/services/catalog.ts`**

```ts
import { and, count, desc, eq, ilike, inArray, isNotNull, sql } from 'drizzle-orm';
import type {
  AssortmentCategory,
  Product,
  Venue as VendorVenue,
  VendorId,
} from '@market/vendor-core';
import type { DbClient } from '../db/client.js';
import {
  categories,
  embeddingJobs,
  itemEmbeddings,
  items,
  priceObservations,
  venues,
  type ItemRow,
  type VenueRow,
} from '../db/schema.js';
import type { Embedder } from '../embeddings/index.js';

export interface CatalogService {
  upsertVenues(vendor: VendorId, list: VendorVenue[]): Promise<void>;
  upsertCategories(vendor: VendorId, venueSlug: string, cats: AssortmentCategory[]): Promise<void>;
  upsertItems(vendor: VendorId, venueSlug: string, products: Product[]): Promise<number>;
  touchVenueAssortmentRefresh(vendor: VendorId, venueSlug: string): Promise<void>;
  listVenues(filter: {
    vendor?: VendorId;
    productLine?: string;
    online?: boolean;
    q?: string;
    limit?: number;
  }): Promise<VenueRow[]>;
  getVenue(vendor: VendorId, slug: string): Promise<VenueRow | undefined>;
  searchItemsHybrid(query: string, embedder: Embedder, limit: number): Promise<HybridItemHit[]>;
  searchItemsKeyword(query: string, limit: number): Promise<HybridItemHit[]>;
  searchItemsByBarcode(gtin: string): Promise<HybridItemHit[]>;
  stats(): Promise<{
    venues: number;
    categories: number;
    items: number;
    itemsWithEmbedding: number;
    venuesWithAssortment: number;
  }>;
}

export interface HybridItemHit {
  id: string;
  vendor: VendorId;
  venueId: string;
  venueSlug: string;
  venueName: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  gtin: string | null;
  imageUrl: string | null;
  online: boolean;
  deliveryPriceInt: number | null;
  score: number | null;
}

function mapVendorVenueToInsert(vendor: VendorId, v: VendorVenue) {
  return {
    vendor,
    vendorSlug: v.slug,
    name: v.name,
    productLine: (v.productLine ?? null) as ItemRow['vendor'] extends never ? never : VenueRow['productLine'],
    online: v.online ?? false,
    currency: v.currency ?? 'GEL',
    lat: v.location?.lat != null ? String(v.location.lat) : null,
    lon: v.location?.lon != null ? String(v.location.lon) : null,
    address: v.address ?? null,
    rawContent: (v.raw ?? null) as unknown as object | null,
    lastSeenAt: new Date(),
  };
}

function hydrateHit(row: Record<string, unknown>): HybridItemHit {
  return {
    id: row.id as string,
    vendor: row.vendor as VendorId,
    venueId: row.venue_id as string,
    venueSlug: row.venue_slug as string,
    venueName: (row.venue_name as string) ?? '',
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    priceMinor: Number(row.price_minor),
    currency: row.currency as string,
    gtin: (row.gtin as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    online: Boolean(row.online),
    deliveryPriceInt: null,
    score: row.score != null ? Number(row.score) : null,
  };
}

export function createCatalogService(db: DbClient): CatalogService {
  return {
    async upsertVenues(vendor, list) {
      if (list.length === 0) return;
      const rows = list.map((v) => mapVendorVenueToInsert(vendor, v));
      await db
        .insert(venues)
        .values(rows)
        .onConflictDoUpdate({
          target: [venues.vendor, venues.vendorSlug],
          set: {
            name: sql`excluded.name`,
            productLine: sql`excluded.product_line`,
            online: sql`excluded.online`,
            currency: sql`excluded.currency`,
            lat: sql`excluded.lat`,
            lon: sql`excluded.lon`,
            address: sql`excluded.address`,
            rawContent: sql`excluded.raw_content`,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        });
    },

    async upsertCategories(vendor, venueSlug, cats) {
      const venueRow = await db.query.venues.findFirst({
        where: and(eq(venues.vendor, vendor), eq(venues.vendorSlug, venueSlug)),
      });
      if (!venueRow) return;
      const flat: Array<{
        venueId: string;
        vendorSlug: string;
        parentSlug: string | null;
        name: string;
        position: number | null;
      }> = [];
      let pos = 0;
      const walk = (list: AssortmentCategory[], parent: string | null) => {
        for (const c of list) {
          flat.push({
            venueId: venueRow.id,
            vendorSlug: c.slug,
            parentSlug: parent,
            name: c.name,
            position: pos++,
          });
          if (c.subcategories?.length) walk(c.subcategories, c.slug);
        }
      };
      walk(cats, null);
      if (flat.length === 0) return;
      await db
        .insert(categories)
        .values(flat)
        .onConflictDoUpdate({
          target: [categories.venueId, categories.vendorSlug],
          set: {
            parentSlug: sql`excluded.parent_slug`,
            name: sql`excluded.name`,
            position: sql`excluded.position`,
          },
        });
    },

    async upsertItems(vendor, venueSlug, products) {
      if (products.length === 0) return 0;
      const venueRow = await db.query.venues.findFirst({
        where: and(eq(venues.vendor, vendor), eq(venues.vendorSlug, venueSlug)),
      });
      if (!venueRow) return 0;

      const rows = products.map((p) => ({
        venueId: venueRow.id,
        vendor,
        vendorItemId: p.id,
        name: p.name,
        description: p.description ?? null,
        gtin: p.gtin ?? null,
        imageUrl: p.images[0] ?? null,
        priceMinor: p.price,
        currency: p.currency,
        available: !p.disabled,
        tags: p.tags ?? [],
        lastSeenAt: new Date(),
      }));

      const inserted = await db
        .insert(items)
        .values(rows)
        .onConflictDoUpdate({
          target: [items.venueId, items.vendorItemId],
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            gtin: sql`excluded.gtin`,
            imageUrl: sql`excluded.image_url`,
            priceMinor: sql`excluded.price_minor`,
            currency: sql`excluded.currency`,
            available: sql`excluded.available`,
            tags: sql`excluded.tags`,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        })
        .returning({ id: items.id, priceMinor: items.priceMinor, currency: items.currency, available: items.available });

      if (inserted.length > 0) {
        await db.insert(priceObservations).values(
          inserted.map((r) => ({
            itemId: r.id,
            priceMinor: r.priceMinor,
            currency: r.currency,
            available: r.available,
          })),
        );
        await db
          .insert(embeddingJobs)
          .values(inserted.map((r) => ({ itemId: r.id })))
          .onConflictDoNothing();
      }
      return inserted.length;
    },

    async touchVenueAssortmentRefresh(vendor, venueSlug) {
      await db
        .update(venues)
        .set({ lastAssortmentRefreshAt: new Date() })
        .where(and(eq(venues.vendor, vendor), eq(venues.vendorSlug, venueSlug)));
    },

    async listVenues(filter) {
      const conds = [];
      if (filter.vendor) conds.push(eq(venues.vendor, filter.vendor));
      if (filter.productLine) conds.push(eq(venues.productLine, filter.productLine as never));
      if (filter.online != null) conds.push(eq(venues.online, filter.online));
      if (filter.q) conds.push(ilike(venues.name, `%${filter.q}%`));
      return db
        .select()
        .from(venues)
        .where(conds.length ? and(...conds) : undefined)
        .limit(filter.limit ?? 200);
    },

    async getVenue(vendor, slug) {
      return db.query.venues.findFirst({
        where: and(eq(venues.vendor, vendor), eq(venues.vendorSlug, slug)),
      });
    },

    async searchItemsHybrid(query, embedder, limit) {
      const [vec] = await embedder.embed([query]);
      if (!vec) return [];
      const vecLiteral = `[${vec.join(',')}]`;
      // The SQL below is a direct copy of the RRF query in spec §4.5, parameterized for drizzle.
      const rows = await db.execute<Record<string, unknown>>(sql`
        WITH
          q AS (SELECT ${query}::text AS qtext, ${vecLiteral}::vector(1024) AS qvec),
          fts AS (
            SELECT i.id, ROW_NUMBER() OVER (
              ORDER BY ts_rank(
                to_tsvector('simple', i.search_text),
                plainto_tsquery('simple', (SELECT qtext FROM q))
              ) DESC
            ) AS rnk
            FROM items i
            WHERE to_tsvector('simple', i.search_text) @@ plainto_tsquery('simple', (SELECT qtext FROM q))
            LIMIT 200
          ),
          vec AS (
            SELECT ie.item_id AS id, ROW_NUMBER() OVER (
              ORDER BY ie.embedding <=> (SELECT qvec FROM q)
            ) AS rnk
            FROM item_embeddings ie
            ORDER BY ie.embedding <=> (SELECT qvec FROM q)
            LIMIT 200
          ),
          fused AS (
            SELECT id, SUM(1.0 / (60 + rnk)) AS score
            FROM (SELECT * FROM fts UNION ALL SELECT * FROM vec) x
            GROUP BY id
          )
        SELECT
          i.id, i.vendor, i.venue_id, i.name, i.description, i.price_minor, i.currency,
          i.gtin, i.image_url, i.available AS online,
          v.vendor_slug AS venue_slug, v.name AS venue_name,
          f.score
        FROM fused f
        JOIN items i ON i.id = f.id
        JOIN venues v ON v.id = i.venue_id
        ORDER BY f.score DESC
        LIMIT ${limit};
      `);
      return rows.rows.map(hydrateHit);
    },

    async searchItemsKeyword(query, limit) {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT
          i.id, i.vendor, i.venue_id, i.name, i.description, i.price_minor, i.currency,
          i.gtin, i.image_url, i.available AS online,
          v.vendor_slug AS venue_slug, v.name AS venue_name,
          ts_rank(to_tsvector('simple', i.search_text), plainto_tsquery('simple', ${query})) AS score
        FROM items i
        JOIN venues v ON v.id = i.venue_id
        WHERE to_tsvector('simple', i.search_text) @@ plainto_tsquery('simple', ${query})
        ORDER BY score DESC, i.price_minor ASC
        LIMIT ${limit};
      `);
      return rows.rows.map(hydrateHit);
    },

    async searchItemsByBarcode(gtin) {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT
          i.id, i.vendor, i.venue_id, i.name, i.description, i.price_minor, i.currency,
          i.gtin, i.image_url, i.available AS online,
          v.vendor_slug AS venue_slug, v.name AS venue_name,
          NULL::double precision AS score
        FROM items i
        JOIN venues v ON v.id = i.venue_id
        WHERE i.gtin = ${gtin} AND i.available = true
        ORDER BY i.price_minor ASC;
      `);
      return rows.rows.map(hydrateHit);
    },

    async stats() {
      const [venueCount] = await db.select({ n: count() }).from(venues);
      const [catCount] = await db.select({ n: count() }).from(categories);
      const [itemCount] = await db.select({ n: count() }).from(items);
      const [embCount] = await db.select({ n: count() }).from(itemEmbeddings);
      const [freshCount] = await db
        .select({ n: count() })
        .from(venues)
        .where(isNotNull(venues.lastAssortmentRefreshAt));
      return {
        venues: Number(venueCount?.n ?? 0),
        categories: Number(catCount?.n ?? 0),
        items: Number(itemCount?.n ?? 0),
        itemsWithEmbedding: Number(embCount?.n ?? 0),
        venuesWithAssortment: Number(freshCount?.n ?? 0),
      };
    },
  };
}
```

---

## Task 14: `apps/api` shopping-list service (port `services/shoppingList.ts`)

**Purpose:** Port the shopping list optimizer from `.legacy/src/services/shoppingList.ts`. Algorithm unchanged; data source is now the drizzle-backed `CatalogService` instead of the sqlite `Store`.

**Files:**
- Create: `apps/api/src/services/shopping-list.ts`

**Source reference:** `.legacy/src/services/shoppingList.ts` lines 83–272. The two optimizer methods (`optimizeCheapestPerItem`, `optimizeSingleStore`) are copied structurally; only the row-fetching (`resolve()`) changes.

- [ ] **Step 1: Create `apps/api/src/services/shopping-list.ts`**

```ts
import type { Embedder } from '../embeddings/index.js';
import type { CatalogService, HybridItemHit } from './catalog.js';

export type Strategy = 'cheapest-per-item' | 'single-store';

export interface ShoppingRequest {
  items: Array<{ query: string; quantity?: number }>;
  venueSlugs?: string[];
  includeOffline?: boolean;
}

export interface ItemCandidate {
  venueSlug: string;
  venueName: string;
  itemId: string;
  itemName: string;
  priceMinor: number;
  currency: string;
  unitInfo?: string;
  deliveryPriceInt?: number;
  online: boolean;
}

export interface CheapestPerItemPlan {
  strategy: 'cheapest-per-item';
  lines: Array<{
    query: string;
    quantity: number;
    chosen?: ItemCandidate;
    lineTotalMinor?: number;
    unmet?: true;
    alternatives: ItemCandidate[];
  }>;
  uniqueVenues: string[];
  itemsSubtotalMinor: number;
  deliverySubtotalMinor: number;
  grandTotalMinor: number;
  currency: string;
  unmet: string[];
}

export interface SingleStorePlan {
  strategy: 'single-store';
  venueSlug: string;
  venueName: string;
  itemsSubtotalMinor: number;
  deliveryFeeMinor: number;
  grandTotalMinor: number;
  currency: string;
  lines: Array<{
    query: string;
    quantity: number;
    chosen?: ItemCandidate;
    lineTotalMinor?: number;
    unmet?: true;
  }>;
  unmet: string[];
}

export interface ResolvedLine {
  query: string;
  quantity: number;
  candidates: ItemCandidate[];
}

export interface ShoppingListService {
  optimizeCheapestPerItem(req: ShoppingRequest): Promise<CheapestPerItemPlan>;
  optimizeSingleStore(req: ShoppingRequest): Promise<SingleStorePlan>;
}

function looksLikeBarcode(s: string): boolean {
  return /^\d{8,14}$/.test(s.trim());
}

function hitToCandidate(h: HybridItemHit): ItemCandidate {
  return {
    venueSlug: h.venueSlug,
    venueName: h.venueName,
    itemId: h.id,
    itemName: h.name,
    priceMinor: h.priceMinor,
    currency: h.currency,
    deliveryPriceInt: h.deliveryPriceInt ?? undefined,
    online: h.online,
  };
}

export function createShoppingListService(
  catalog: CatalogService,
  embedder: Embedder,
): ShoppingListService {
  async function resolve(req: ShoppingRequest): Promise<ResolvedLine[]> {
    const venueFilter = req.venueSlugs ? new Set(req.venueSlugs) : null;
    const includeOffline = !!req.includeOffline;

    return Promise.all(
      req.items.map(async ({ query, quantity }) => {
        const q = query.trim();
        let hits: HybridItemHit[] = [];
        if (looksLikeBarcode(q)) {
          hits = await catalog.searchItemsByBarcode(q);
        } else {
          hits = await catalog.searchItemsHybrid(q, embedder, 200);
          if (hits.length === 0) hits = await catalog.searchItemsKeyword(q, 200);
        }

        const byVenue = new Map<string, HybridItemHit>();
        for (const h of hits) {
          if (venueFilter && !venueFilter.has(h.venueSlug)) continue;
          if (!includeOffline && !h.online) continue;
          const existing = byVenue.get(h.venueSlug);
          if (!existing || h.priceMinor < existing.priceMinor) byVenue.set(h.venueSlug, h);
        }

        return {
          query: q,
          quantity: Math.max(1, Math.floor(quantity ?? 1)),
          candidates: [...byVenue.values()]
            .map(hitToCandidate)
            .sort((a, b) => a.priceMinor - b.priceMinor),
        };
      }),
    );
  }

  return {
    async optimizeCheapestPerItem(req) {
      const resolved = await resolve(req);
      const lines = resolved.map((line) => {
        const chosen = line.candidates[0];
        if (!chosen) {
          return {
            query: line.query,
            quantity: line.quantity,
            unmet: true as const,
            alternatives: [] as ItemCandidate[],
          };
        }
        return {
          query: line.query,
          quantity: line.quantity,
          chosen,
          lineTotalMinor: chosen.priceMinor * line.quantity,
          alternatives: line.candidates.slice(1, 4),
        };
      });

      const currency = lines.find((l) => l.chosen)?.chosen?.currency ?? 'GEL';
      const itemsSubtotalMinor = lines.reduce((s, l) => s + (l.lineTotalMinor ?? 0), 0);

      const venueFees = new Map<string, number>();
      for (const l of lines) {
        if (!l.chosen) continue;
        if (!venueFees.has(l.chosen.venueSlug)) {
          venueFees.set(l.chosen.venueSlug, l.chosen.deliveryPriceInt ?? 0);
        }
      }
      const deliverySubtotalMinor = [...venueFees.values()].reduce((s, f) => s + f, 0);

      return {
        strategy: 'cheapest-per-item',
        lines,
        uniqueVenues: [...venueFees.keys()],
        itemsSubtotalMinor,
        deliverySubtotalMinor,
        grandTotalMinor: itemsSubtotalMinor + deliverySubtotalMinor,
        currency,
        unmet: lines.filter((l) => l.unmet).map((l) => l.query),
      };
    },

    async optimizeSingleStore(req) {
      const resolved = await resolve(req);

      type Bucket = {
        venueName: string;
        currency: string;
        deliveryFee: number;
        lineCandidates: Map<number, ItemCandidate>;
      };
      const perVenue = new Map<string, Bucket>();

      resolved.forEach((line, idx) => {
        for (const c of line.candidates) {
          let bucket = perVenue.get(c.venueSlug);
          if (!bucket) {
            bucket = {
              venueName: c.venueName,
              currency: c.currency,
              deliveryFee: c.deliveryPriceInt ?? 0,
              lineCandidates: new Map(),
            };
            perVenue.set(c.venueSlug, bucket);
          }
          const existing = bucket.lineCandidates.get(idx);
          if (!existing || c.priceMinor < existing.priceMinor) {
            bucket.lineCandidates.set(idx, c);
          }
        }
      });

      let best: { slug: string; plan: SingleStorePlan; coverage: number } | null = null;

      for (const [slug, v] of perVenue.entries()) {
        const lines = resolved.map((line, idx) => {
          const c = v.lineCandidates.get(idx);
          if (!c) {
            return { query: line.query, quantity: line.quantity, unmet: true as const };
          }
          return {
            query: line.query,
            quantity: line.quantity,
            chosen: c,
            lineTotalMinor: c.priceMinor * line.quantity,
          };
        });
        const coverage = lines.filter((l) => l.chosen).length;
        const itemsSubtotalMinor = lines.reduce((s, l) => s + (l.lineTotalMinor ?? 0), 0);
        const plan: SingleStorePlan = {
          strategy: 'single-store',
          venueSlug: slug,
          venueName: v.venueName,
          itemsSubtotalMinor,
          deliveryFeeMinor: v.deliveryFee,
          grandTotalMinor: itemsSubtotalMinor + v.deliveryFee,
          currency: v.currency,
          lines,
          unmet: lines.filter((l) => l.unmet).map((l) => l.query),
        };
        if (
          !best ||
          coverage > best.coverage ||
          (coverage === best.coverage && plan.grandTotalMinor < best.plan.grandTotalMinor)
        ) {
          best = { slug, plan, coverage };
        }
      }

      if (!best) {
        return {
          strategy: 'single-store',
          venueSlug: '',
          venueName: '(no venue can fulfil any item)',
          itemsSubtotalMinor: 0,
          deliveryFeeMinor: 0,
          grandTotalMinor: 0,
          currency: 'GEL',
          lines: resolved.map((l) => ({ query: l.query, quantity: l.quantity, unmet: true as const })),
          unmet: resolved.map((l) => l.query),
        };
      }
      return best.plan;
    },
  };
}
```

---

## Task 15: `apps/api` embedding worker

**Purpose:** In-process background loop that picks up rows from `embedding_jobs`, calls the selected embedder, upserts vectors, and deletes the job. Uses `SELECT ... FOR UPDATE SKIP LOCKED` for multi-worker safety (even though we run one worker today).

**Files:**
- Create: `apps/api/src/workers/embedding-worker.ts`

- [ ] **Step 1: Create `apps/api/src/workers/embedding-worker.ts`**

```ts
import { sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { itemEmbeddings, items } from '../db/schema.js';
import type { Embedder } from '../embeddings/index.js';

export interface EmbeddingWorkerHandle {
  stop(): Promise<void>;
}

const BATCH_SIZE = 100;
const TICK_MS = 5_000;

export function startEmbeddingWorker(db: DbClient, embedder: Embedder): EmbeddingWorkerHandle {
  let stopped = false;
  let pending: Promise<void> = Promise.resolve();

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      await db.transaction(async (tx) => {
        const locked = await tx.execute<{ item_id: string }>(sql`
          WITH candidate AS (
            SELECT item_id FROM embedding_jobs
            WHERE locked_at IS NULL OR locked_at < now() - interval '5 minutes'
            ORDER BY enqueued_at
            LIMIT ${BATCH_SIZE}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE embedding_jobs j
          SET locked_at = now(), attempts = attempts + 1
          FROM candidate c
          WHERE j.item_id = c.item_id
          RETURNING j.item_id;
        `);
        const ids = locked.rows.map((r) => r.item_id);
        if (ids.length === 0) return;

        const rows = await tx
          .select({ id: items.id, name: items.name, description: items.description })
          .from(items)
          .where(sql`${items.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);

        const texts = rows.map((r) => `${r.name} ${r.description ?? ''}`.trim());
        const vectors = await embedder.embed(texts);

        if (vectors.length !== rows.length) {
          throw new Error(`embedder returned ${vectors.length} vectors for ${rows.length} inputs`);
        }

        const values = rows.map((r, i) => ({
          itemId: r.id,
          embedding: vectors[i]!,
          modelVersion: embedder.id,
        }));

        await tx
          .insert(itemEmbeddings)
          .values(values)
          .onConflictDoUpdate({
            target: itemEmbeddings.itemId,
            set: {
              embedding: sql`excluded.embedding`,
              modelVersion: sql`excluded.model_version`,
              embeddedAt: sql`now()`,
            },
          });

        await tx.execute(sql`
          DELETE FROM embedding_jobs
          WHERE item_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)});
        `);
      });
    } catch (err) {
      console.error('[embedding-worker] tick failed:', err);
      // Leave the rows locked; next tick retries after the lock expiry.
    }
  }

  async function loop(): Promise<void> {
    while (!stopped) {
      const started = Date.now();
      await tick();
      const elapsed = Date.now() - started;
      const wait = Math.max(0, TICK_MS - elapsed);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  pending = loop();

  return {
    async stop() {
      stopped = true;
      await pending;
    },
  };
}
```

---

## Task 16: `apps/api` Fastify routes

**Purpose:** Wire every `@market/contracts` schema to a Fastify route, delegating to the catalog/shopping-list services.

**Files:**
- Create: `apps/api/src/routes/venues.ts`
- Create: `apps/api/src/routes/catalog.ts`
- Create: `apps/api/src/routes/shopping-list.ts`
- Create: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/routes/index.ts`
- Create: `apps/api/src/plugins/auth.ts`

- [ ] **Step 1: Create `apps/api/src/plugins/auth.ts`**

```ts
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { environment } from '../environment.js';

export function requireApiToken(request: FastifyRequest, reply: FastifyReply): void {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'missing bearer token' });
    return;
  }
  const token = header.slice('Bearer '.length);
  if (token !== environment.API_TOKEN) {
    reply.code(403).send({ error: 'invalid token' });
    return;
  }
}

export const authPlugin: FastifyPluginCallback = (app, _opts, done) => {
  app.decorate('requireApiToken', requireApiToken);
  done();
};

declare module 'fastify' {
  interface FastifyInstance {
    requireApiToken: typeof requireApiToken;
  }
}
```

- [ ] **Step 2: Create `apps/api/src/routes/venues.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  GetVenueParamsSchema,
  ListVenuesQuerySchema,
  RefreshAssortmentParamsSchema,
  ROUTES,
  type GetVenueResponse,
  type ListVenuesResponse,
  type RefreshAssortmentResponse,
} from '@market/contracts';
import type { CatalogService } from '../services/catalog.js';
import type { VendorRegistry } from '@market/vendor-core';

export function venuesRoutes(
  catalog: CatalogService,
  registry: VendorRegistry,
): FastifyPluginAsync {
  return async (app) => {
    app.get(ROUTES.venues.list, async (request, reply) => {
      const parsed = v.safeParse(ListVenuesQuerySchema, request.query);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid query', issues: parsed.issues });
        return;
      }
      const rows = await catalog.listVenues({
        vendor: parsed.output.vendor,
        productLine: parsed.output.productLine,
        online: parsed.output.online,
        q: parsed.output.q,
        limit: parsed.output.limit,
      });
      const response: ListVenuesResponse = {
        venues: rows.map((r) => ({
          vendor: r.vendor,
          id: r.id,
          slug: r.vendorSlug,
          name: r.name,
          address: r.address ?? undefined,
          currency: r.currency,
          productLine: r.productLine ?? undefined,
          online: r.online,
        })),
      };
      return response;
    });

    app.get(ROUTES.venues.get(':vendor', ':slug'), async (request, reply) => {
      const parsed = v.safeParse(GetVenueParamsSchema, request.params);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid params' });
        return;
      }
      const row = await catalog.getVenue(parsed.output.vendor, parsed.output.slug);
      if (!row) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      const response: GetVenueResponse = {
        venue: {
          vendor: row.vendor,
          id: row.id,
          slug: row.vendorSlug,
          name: row.name,
          address: row.address ?? undefined,
          currency: row.currency,
          productLine: row.productLine ?? undefined,
          online: row.online,
        },
      };
      return response;
    });

    app.post(
      ROUTES.venues.refreshAssortment(':vendor', ':slug'),
      async (request, reply) => {
        const parsed = v.safeParse(RefreshAssortmentParamsSchema, request.params);
        if (!parsed.success) {
          reply.code(400).send({ error: 'invalid params' });
          return;
        }
        const vendor = registry.get(parsed.output.vendor);
        const index = await vendor.getAssortmentIndex(parsed.output.slug);
        await catalog.upsertCategories(parsed.output.vendor, parsed.output.slug, index.categories);
        const flat: typeof index.categories = [];
        const walk = (list: typeof index.categories) => {
          for (const c of list) {
            flat.push(c);
            if (c.subcategories?.length) walk(c.subcategories);
          }
        };
        walk(index.categories);

        let itemsCount = 0;
        let errors = 0;
        for (const cat of flat) {
          try {
            const page = await vendor.getCategoryItems(parsed.output.slug, cat.slug);
            const n = await catalog.upsertItems(parsed.output.vendor, parsed.output.slug, page.items);
            itemsCount += n;
          } catch (err) {
            errors++;
            app.log.warn({ err, slug: parsed.output.slug, category: cat.slug }, 'refresh cat failed');
          }
        }
        await catalog.touchVenueAssortmentRefresh(parsed.output.vendor, parsed.output.slug);
        const response: RefreshAssortmentResponse = {
          slug: parsed.output.slug,
          categories: flat.length,
          items: itemsCount,
          errors,
        };
        return response;
      },
    );
  };
}
```

- [ ] **Step 3: Create `apps/api/src/routes/catalog.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  CatalogStatsResponseSchema,
  ROUTES,
  SearchItemsQuerySchema,
  type CatalogStatsResponse,
  type SearchItemsResponse,
} from '@market/contracts';
import type { CatalogService, HybridItemHit } from '../services/catalog.js';
import type { Embedder } from '../embeddings/index.js';

function hitToResult(h: HybridItemHit) {
  return {
    id: h.id,
    vendor: h.vendor,
    venueSlug: h.venueSlug,
    venueName: h.venueName,
    name: h.name,
    description: h.description ?? undefined,
    priceMinor: h.priceMinor,
    currency: h.currency,
    gtin: h.gtin ?? undefined,
    imageUrl: h.imageUrl ?? undefined,
    score: h.score ?? undefined,
  };
}

export function catalogRoutes(catalog: CatalogService, embedder: Embedder): FastifyPluginAsync {
  return async (app) => {
    app.get(ROUTES.catalog.search, async (request, reply) => {
      const parsed = v.safeParse(SearchItemsQuerySchema, request.query);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid query', issues: parsed.issues });
        return;
      }
      const { q, mode, limit } = parsed.output;
      let hits: HybridItemHit[];
      switch (mode) {
        case 'keyword':
          hits = await catalog.searchItemsKeyword(q, limit);
          break;
        case 'semantic':
        case 'hybrid':
        default:
          hits = await catalog.searchItemsHybrid(q, embedder, limit);
          break;
      }
      const response: SearchItemsResponse = { items: hits.map(hitToResult), mode };
      return response;
    });

    app.get(ROUTES.catalog.stats, async () => {
      const s = await catalog.stats();
      const response: CatalogStatsResponse = s;
      v.parse(CatalogStatsResponseSchema, response);
      return response;
    });
  };
}
```

- [ ] **Step 4: Create `apps/api/src/routes/shopping-list.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  BuildShoppingListBodySchema,
  ROUTES,
  type BuildShoppingListResponse,
} from '@market/contracts';
import type { ShoppingListService } from '../services/shopping-list.js';

export function shoppingListRoutes(service: ShoppingListService): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.shoppingList, async (request, reply) => {
      const parsed = v.safeParse(BuildShoppingListBodySchema, request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
        return;
      }
      const { items, strategy, venueSlugs, includeOffline } = parsed.output;
      const req = { items, venueSlugs, includeOffline };
      const response: BuildShoppingListResponse = {};
      if (strategy === 'cheapest-per-item' || strategy === 'both') {
        response.cheapestPerItem = await service.optimizeCheapestPerItem(req);
      }
      if (strategy === 'single-store' || strategy === 'both') {
        response.singleStore = await service.optimizeSingleStore(req);
      }
      return response;
    });
  };
}
```

- [ ] **Step 5: Create `apps/api/src/routes/admin.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import { CrawlBodySchema, ROUTES, type CrawlResponse } from '@market/contracts';
import type { VendorRegistry } from '@market/vendor-core';
import type { CatalogService } from '../services/catalog.js';
import { environment } from '../environment.js';

export function adminRoutes(
  catalog: CatalogService,
  registry: VendorRegistry,
): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.admin.crawl, { preHandler: app.requireApiToken }, async (request, reply) => {
      const parsed = v.safeParse(CrawlBodySchema, request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
        return;
      }
      const vendorIds = parsed.output.vendor ? [parsed.output.vendor] : registry.ids();

      let venuesSeen = 0;
      let itemsSeen = 0;
      let errors = 0;

      for (const vid of vendorIds) {
        const vendor = registry.get(vid);
        try {
          const list = await vendor.discoverVenues({
            lat: environment.WOLT_LAT,
            lon: environment.WOLT_LON,
          });
          await catalog.upsertVenues(vid, list);
          venuesSeen += list.length;
          if (parsed.output.venuesOnly) continue;

          const targetSlugs = parsed.output.venueSlugs ?? list.map((v) => v.slug);
          for (const slug of targetSlugs) {
            try {
              const index = await vendor.getAssortmentIndex(slug);
              await catalog.upsertCategories(vid, slug, index.categories);
              const flat = [] as typeof index.categories;
              const walk = (l: typeof index.categories) => {
                for (const c of l) {
                  flat.push(c);
                  if (c.subcategories?.length) walk(c.subcategories);
                }
              };
              walk(index.categories);
              for (const cat of flat) {
                try {
                  const page = await vendor.getCategoryItems(slug, cat.slug);
                  itemsSeen += await catalog.upsertItems(vid, slug, page.items);
                } catch (err) {
                  errors++;
                  app.log.warn({ err, vid, slug, cat: cat.slug }, 'crawl cat failed');
                }
              }
              await catalog.touchVenueAssortmentRefresh(vid, slug);
            } catch (err) {
              errors++;
              app.log.warn({ err, vid, slug }, 'crawl venue failed');
            }
          }
        } catch (err) {
          errors++;
          app.log.warn({ err, vid }, 'crawl vendor failed');
        }
      }

      const response: CrawlResponse = {
        vendor: parsed.output.vendor,
        venues: venuesSeen,
        items: itemsSeen,
        errors,
      };
      return response;
    });
  };
}
```

- [ ] **Step 6: Create `apps/api/src/routes/index.ts`**

```ts
export { venuesRoutes } from './venues.js';
export { catalogRoutes } from './catalog.js';
export { shoppingListRoutes } from './shopping-list.js';
export { adminRoutes } from './admin.js';
```

---

## Task 17: `apps/api` crawler CLI

**Purpose:** Command-line entry point that iterates enabled vendors, runs discover + assortment walks, and persists via `CatalogService`. Replaces `.legacy/src/crawler/crawl.ts`.

**Files:**
- Create: `apps/api/src/crawler/crawl.ts`

- [ ] **Step 1: Create `apps/api/src/crawler/crawl.ts`**

```ts
import { closeDb, getDb } from '../db/client.js';
import { getVendorRegistry } from '../vendor-registry.js';
import { createCatalogService } from '../services/catalog.js';
import { environment } from '../environment.js';
import type { VendorId } from '@market/vendor-core';

function arg(name: string): string | undefined {
  // This CLI is allowed to read argv; it's not process.env.
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const MIN_INTERVAL_MS = 400;

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2).filter((x) => x.startsWith('--')));
  const vendorArg = arg('--vendor') as VendorId | undefined;
  const slugArg = arg('--venue');
  const db = getDb();
  const catalog = createCatalogService(db);
  const registry = getVendorRegistry();

  const vendorIds: VendorId[] = vendorArg ? [vendorArg] : registry.ids();

  console.error(`[crawl] vendors=${vendorIds.join(',')} venuesOnly=${flags.has('--venues-only')}`);

  let totalVenues = 0;
  let totalItems = 0;
  let errors = 0;

  for (const vid of vendorIds) {
    const vendor = registry.get(vid);
    console.error(`[crawl] [${vid}] discovering venues...`);
    const list = await vendor.discoverVenues({
      lat: environment.WOLT_LAT,
      lon: environment.WOLT_LON,
    });
    console.error(`[crawl] [${vid}] found ${list.length} venues`);
    await catalog.upsertVenues(vid, list);
    totalVenues += list.length;

    if (flags.has('--venues-only')) continue;

    const targetSlugs = slugArg ? [slugArg] : list.map((v) => v.slug);
    for (let i = 0; i < targetSlugs.length; i++) {
      const slug = targetSlugs[i]!;
      try {
        const index = await vendor.getAssortmentIndex(slug);
        await catalog.upsertCategories(vid, slug, index.categories);
        const flat: typeof index.categories = [];
        const walk = (l: typeof index.categories) => {
          for (const c of l) {
            flat.push(c);
            if (c.subcategories?.length) walk(c.subcategories);
          }
        };
        walk(index.categories);

        for (const cat of flat) {
          await sleep(MIN_INTERVAL_MS);
          try {
            const page = await vendor.getCategoryItems(slug, cat.slug);
            totalItems += await catalog.upsertItems(vid, slug, page.items);
          } catch (err) {
            errors++;
            console.error(`[crawl] [${vid}] ${slug}/${cat.slug} failed: ${String(err).slice(0, 160)}`);
          }
        }
        await catalog.touchVenueAssortmentRefresh(vid, slug);
        if (i % 10 === 0) console.error(`[crawl] [${vid}] ${i}/${targetSlugs.length} ${slug}`);
      } catch (err) {
        errors++;
        console.error(`[crawl] [${vid}] ${slug} failed: ${String(err).slice(0, 160)}`);
      }
    }
  }

  console.error(`[crawl] done. venues=${totalVenues} items=${totalItems} errors=${errors}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## Task 18: `apps/api` server bootstrap

**Purpose:** Boot Fastify, register routes, optionally start the embedding worker, handle graceful shutdown.

**Files:**
- Create: `apps/api/src/server.ts`

- [ ] **Step 1: Create `apps/api/src/server.ts`**

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { environment } from './environment.js';
import { getDb, closeDb } from './db/client.js';
import { createCatalogService } from './services/catalog.js';
import { createShoppingListService } from './services/shopping-list.js';
import { getEmbedder } from './embeddings/index.js';
import { getVendorRegistry } from './vendor-registry.js';
import { authPlugin } from './plugins/auth.js';
import {
  adminRoutes,
  catalogRoutes,
  shoppingListRoutes,
  venuesRoutes,
} from './routes/index.js';
import { startEmbeddingWorker, type EmbeddingWorkerHandle } from './workers/embedding-worker.js';

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: environment.NODE_ENV === 'production' ? 'info' : 'debug' } });

  await app.register(cors, { origin: true });
  await app.register(authPlugin);

  const db = getDb();
  const embedder = getEmbedder();
  const registry = getVendorRegistry();
  const catalog = createCatalogService(db);
  const shoppingList = createShoppingListService(catalog, embedder);

  await app.register(venuesRoutes(catalog, registry));
  await app.register(catalogRoutes(catalog, embedder));
  await app.register(shoppingListRoutes(shoppingList));
  await app.register(adminRoutes(catalog, registry));

  app.get('/health', async () => ({ ok: true }));

  let worker: EmbeddingWorkerHandle | null = null;
  if (environment.EMBEDDING_WORKER === 'on') {
    worker = startEmbeddingWorker(db, embedder);
    app.log.info('embedding worker started');
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      if (worker) await worker.stop();
      await app.close();
      await closeDb();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: environment.API_PORT, host: '0.0.0.0' });
  app.log.info(`listening on :${environment.API_PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## Task 19: `apps/mcp` scaffold with `market_*` tools

**Purpose:** Rebuild the MCP server as a thin client of `apps/api`. Every tool parses input with a valibot schema, forwards the call to api via `fetch`, and returns the result. Stdio + streamable-HTTP transports preserved from the legacy server.

**Files:**
- Create: `apps/mcp/package.json`
- Create: `apps/mcp/tsconfig.json`
- Create: `apps/mcp/eslint.config.js`
- Create: `apps/mcp/src/environment.ts`
- Create: `apps/mcp/src/api-client.ts`
- Create: `apps/mcp/src/tools.ts`
- Create: `apps/mcp/src/server.ts`

- [ ] **Step 1: Create `apps/mcp/package.json`**

```json
{
  "name": "@market/mcp",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/server.js",
  "bin": {
    "market-mcp": "dist/server.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@market/contracts": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "undici": "^6.19.8",
    "valibot": "^1.0.0-beta.9",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@market/config": "workspace:*",
    "@types/node": "^22.9.0",
    "madge": "^8.0.0",
    "rimraf": "^6.0.1",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3"
  }
}
```

Note: `zod` is kept because `@modelcontextprotocol/sdk`'s `registerTool` takes a `z.*` input shape. We keep all request/response domain validation in valibot via `@market/contracts`; zod is used only as a thin adapter at the MCP tool boundary.

- [ ] **Step 2: Create `apps/mcp/tsconfig.json`**

```jsonc
{
  "extends": "@market/config/tsconfig/node",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `apps/mcp/eslint.config.js`**

```js
import node from '@market/config/eslint/node';
import boundaries from '@market/config/eslint/boundaries';

export default [...node, ...boundaries];
```

- [ ] **Step 4: Create `apps/mcp/src/environment.ts`**

```ts
import * as v from 'valibot';

const Schema = v.object({
  NODE_ENV: v.picklist(['development', 'production', 'test'] as const),
  API_URL: v.pipe(v.string(), v.url()),
  API_TOKEN: v.pipe(v.string(), v.minLength(8)),
  MCP_HTTP: v.optional(v.picklist(['0', '1'] as const), '0'),
  MCP_PORT: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), '8787'),
  MCP_TLS_CERT: v.optional(v.string()),
  MCP_TLS_KEY: v.optional(v.string()),
});

export type Environment = v.InferOutput<typeof Schema>;

function parseEnv(): Environment {
  // eslint-disable-next-line no-restricted-properties, no-restricted-syntax
  const result = v.safeParse(Schema, process.env);
  if (result.success) return Object.freeze(result.output);
  const issues = result.issues
    .map((i) => {
      const path = (i.path ?? []).map((p) => (p as { key?: string }).key ?? '').join('.');
      return `  - ${path || '(root)'}: ${i.message}`;
    })
    .join('\n');
  console.error(`[@market/mcp] invalid environment:\n${issues}`);
  process.exit(1);
}

export const environment = parseEnv();
```

- [ ] **Step 5: Create `apps/mcp/src/api-client.ts`**

```ts
import { request } from 'undici';
import { environment } from './environment.js';

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

async function parse<T>(statusCode: number, buf: string, label: string): Promise<T> {
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`${label} → ${statusCode}: ${buf.slice(0, 300)}`);
  }
  return JSON.parse(buf) as T;
}

export function createApiClient(): ApiClient {
  const base = environment.API_URL.replace(/\/$/, '');
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${environment.API_TOKEN}`,
  };
  return {
    async get<T>(path: string): Promise<T> {
      const { statusCode, body } = await request(`${base}${path}`, {
        method: 'GET',
        headers,
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      return parse<T>(statusCode, await body.text(), `GET ${path}`);
    },
    async post<T>(path: string, body: unknown): Promise<T> {
      const { statusCode, body: resBody } = await request(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      return parse<T>(statusCode, await resBody.text(), `POST ${path}`);
    },
  };
}
```

- [ ] **Step 6: Create `apps/mcp/src/tools.ts`**

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ROUTES } from '@market/contracts';
import type {
  BuildShoppingListBody,
  BuildShoppingListResponse,
  CatalogStatsResponse,
  GetVenueResponse,
  ListVenuesResponse,
  RefreshAssortmentResponse,
  SearchItemsResponse,
} from '@market/contracts';
import type { ApiClient } from './api-client.js';

const VendorEnum = z.enum(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill']);

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerMarketTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    'market_search_venues',
    {
      title: 'Search venues across market vendors',
      description:
        'Search venues (restaurants, grocery stores) by free-text query. Hits api which proxies to the chosen vendor (wolt/glovo/etc).',
      inputSchema: {
        query: z.string().min(1).describe('Free-text query'),
        vendor: VendorEnum.optional().describe('Limit to one vendor; omit for all'),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, vendor, limit }) => {
      const q = new URLSearchParams({ q: query });
      if (vendor) q.set('vendor', vendor);
      if (limit) q.set('limit', String(limit));
      const result = await api.get<ListVenuesResponse>(`${ROUTES.venues.list}?${q.toString()}`);
      return ok(result);
    },
  );

  server.registerTool(
    'market_discover_venues',
    {
      title: 'Discover venues',
      description: 'List venues for the configured location. Same endpoint as search without a query.',
      inputSchema: {
        vendor: VendorEnum.optional(),
        productLine: z.enum(['restaurant', 'store', 'grocery', 'pharmacy', 'other']).optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ vendor, productLine, limit }) => {
      const q = new URLSearchParams();
      if (vendor) q.set('vendor', vendor);
      if (productLine) q.set('productLine', productLine);
      if (limit) q.set('limit', String(limit));
      const result = await api.get<ListVenuesResponse>(`${ROUTES.venues.list}?${q.toString()}`);
      return ok(result);
    },
  );

  server.registerTool(
    'market_list_venues',
    {
      title: 'List stored venues',
      description: 'List venues already stored in the local catalog without fetching upstream.',
      inputSchema: {
        vendor: VendorEnum.optional(),
        productLine: z.enum(['restaurant', 'store', 'grocery', 'pharmacy', 'other']).optional(),
        online: z.boolean().optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ vendor, productLine, online, limit }) => {
      const q = new URLSearchParams();
      if (vendor) q.set('vendor', vendor);
      if (productLine) q.set('productLine', productLine);
      if (online != null) q.set('online', String(online));
      if (limit) q.set('limit', String(limit));
      const result = await api.get<ListVenuesResponse>(`${ROUTES.venues.list}?${q.toString()}`);
      return ok(result);
    },
  );

  server.registerTool(
    'market_get_venue',
    {
      title: 'Get a venue by vendor + slug',
      description: 'Fetch venue detail from api.',
      inputSchema: { vendor: VendorEnum, slug: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ vendor, slug }) => {
      const result = await api.get<GetVenueResponse>(ROUTES.venues.get(vendor, slug));
      return ok(result);
    },
  );

  server.registerTool(
    'market_refresh_assortment',
    {
      title: 'Refresh venue assortment',
      description: 'Trigger a live fetch of a venue assortment and persist it.',
      inputSchema: { vendor: VendorEnum, slug: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ vendor, slug }) => {
      const result = await api.post<RefreshAssortmentResponse>(
        ROUTES.venues.refreshAssortment(vendor, slug),
        {},
      );
      return ok(result);
    },
  );

  server.registerTool(
    'market_search_items',
    {
      title: 'Search items in the catalog',
      description:
        'Full-text + semantic (hybrid) search over stored items. Use refresh_assortment or the crawler to populate.',
      inputSchema: {
        query: z.string().min(1),
        mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
        vendor: VendorEnum.optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ query, mode, vendor, limit }) => {
      const q = new URLSearchParams({ q: query });
      if (mode) q.set('mode', mode);
      if (vendor) q.set('vendor', vendor);
      if (limit) q.set('limit', String(limit));
      const result = await api.get<SearchItemsResponse>(`${ROUTES.catalog.search}?${q.toString()}`);
      return ok(result);
    },
  );

  server.registerTool(
    'market_catalog_stats',
    {
      title: 'Catalog statistics',
      description: 'How many venues, categories, and items are indexed.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async () => {
      const result = await api.get<CatalogStatsResponse>(ROUTES.catalog.stats);
      return ok(result);
    },
  );

  server.registerTool(
    'market_build_shopping_list',
    {
      title: 'Build an optimized shopping list',
      description:
        'Given items (name or barcode) and a strategy, return the optimized plan. Prices are integer minor units (e.g. tetri for GEL).',
      inputSchema: {
        items: z
          .array(
            z.object({
              query: z.string().min(1),
              quantity: z.number().int().min(1).optional(),
            }),
          )
          .min(1),
        strategy: z.enum(['cheapest-per-item', 'single-store', 'both']),
        vendor: VendorEnum.optional(),
        venueSlugs: z.array(z.string()).optional(),
        includeOffline: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      const body: BuildShoppingListBody = {
        items: input.items.map((i) => ({ query: i.query, quantity: i.quantity ?? 1 })),
        strategy: input.strategy,
        vendor: input.vendor,
        venueSlugs: input.venueSlugs,
        includeOffline: input.includeOffline ?? false,
      };
      const result = await api.post<BuildShoppingListResponse>(ROUTES.shoppingList, body);
      return ok(result);
    },
  );
}
```

- [ ] **Step 7: Create `apps/mcp/src/server.ts`**

```ts
#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { environment } from './environment.js';
import { createApiClient } from './api-client.js';
import { registerMarketTools } from './tools.js';

function buildServer(): McpServer {
  const api = createApiClient();
  const server = new McpServer({ name: 'market-mcp', version: '0.1.0' });
  registerMarketTools(server, api);
  return server;
}

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = buildServer();
  await server.connect(transport);
  console.error(`[market-mcp] stdio ready — api=${environment.API_URL}`);
}

async function startHttp(port: number): Promise<void> {
  const certPath = environment.MCP_TLS_CERT;
  const keyPath = environment.MCP_TLS_KEY;
  const useTls = !!(certPath && keyPath);
  const scheme = useTls ? 'https' : 'http';
  const createServer = useTls
    ? (handler: http.RequestListener) =>
        https.createServer(
          { cert: fs.readFileSync(certPath!), key: fs.readFileSync(keyPath!) },
          handler,
        )
    : http.createServer;

  const httpServer = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith('/mcp')) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found. POST/GET /mcp');
      return;
    }
    let body: unknown = undefined;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      if (chunks.length > 0) {
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
      }
    }
    const perReqServer = buildServer();
    const perReqTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      perReqTransport.close();
      perReqServer.close();
    });
    try {
      await perReqServer.connect(perReqTransport);
      await perReqTransport.handleRequest(req, res, body);
    } catch (err) {
      console.error('[market-mcp] request failed:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    }
  });

  httpServer.listen(port, () => {
    console.error(`[market-mcp] ${scheme} ready — ${scheme}://localhost:${port}/mcp  api=${environment.API_URL}`);
  });

  const shutdown = (): void => {
    console.error('[market-mcp] shutting down');
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main(): Promise<void> {
  if (environment.MCP_HTTP === '1') {
    await startHttp(environment.MCP_PORT);
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error('[market-mcp] fatal:', err);
  process.exit(1);
});
```

---

## Task 20: `apps/web` scaffold (Vite + React + Tailwind + TanStack Router/Query)

**Purpose:** Create a minimal but functional web app with a working catalog search page that calls `apps/api` via typed hooks.

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/eslint.config.js`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/index.html`
- Create: `apps/web/src/environment.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`
- Create: `apps/web/src/query-client.ts`
- Create: `apps/web/src/api-client.ts`
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/index.tsx`
- Create: `apps/web/src/router.ts`
- Create: `apps/web/src/styles.css`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@market/web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "dev": "vite",
    "preview": "vite preview",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@market/contracts": "workspace:*",
    "@market/ui": "workspace:*",
    "@tanstack/react-query": "^5.60.2",
    "@tanstack/react-router": "^1.83.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@market/config": "workspace:*",
    "@tanstack/router-plugin": "^1.83.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "madge": "^8.0.0",
    "postcss": "^8.4.49",
    "rimraf": "^6.0.1",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```jsonc
{
  "extends": "@market/config/tsconfig/react",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Create `apps/web/eslint.config.js`**

```js
import react from '@market/config/eslint/react';
import boundaries from '@market/config/eslint/boundaries';

export default [...react, ...boundaries];
```

- [ ] **Step 4: Create `apps/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  server: { port: 5173 },
});
```

- [ ] **Step 5: Create `apps/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';
import preset from '@market/ui/tailwind-preset';

export default {
  presets: [preset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
} satisfies Config;
```

- [ ] **Step 6: Create `apps/web/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Market</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `apps/web/src/environment.ts`**

```ts
import * as v from 'valibot';

const Schema = v.object({
  VITE_API_URL: v.pipe(v.string(), v.url()),
  VITE_APP_NAME: v.optional(v.string(), 'Market'),
});

export type Environment = v.InferOutput<typeof Schema>;

function parseEnv(): Environment {
  const result = v.safeParse(Schema, import.meta.env);
  if (result.success) return Object.freeze(result.output);
  const issues = result.issues
    .map((i) => {
      const path = (i.path ?? []).map((p) => (p as { key?: string }).key ?? '').join('.');
      return `  - ${path || '(root)'}: ${i.message}`;
    })
    .join('\n');
  console.error(`[@market/web] invalid environment:\n${issues}`);
  throw new Error('invalid environment');
}

export const environment = parseEnv();
```

Note: `apps/web` imports `valibot` directly — add it as a dependency in Step 1 by modifying the package.json `dependencies` section to include `"valibot": "^1.0.0-beta.9"` (it arrives transitively via `@market/contracts` at runtime but listing it explicitly keeps imports clean).

- [ ] **Step 9: Create `apps/web/src/query-client.ts`**

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

- [ ] **Step 10: Create `apps/web/src/api-client.ts`**

```ts
import { ROUTES, type SearchItemsResponse } from '@market/contracts';
import { environment } from './environment.js';

const base = environment.VITE_API_URL.replace(/\/$/, '');

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  searchItems: (query: string, mode: 'keyword' | 'semantic' | 'hybrid' = 'hybrid') => {
    const q = new URLSearchParams({ q: query, mode });
    return get<SearchItemsResponse>(`${ROUTES.catalog.search}?${q.toString()}`);
  },
};
```

- [ ] **Step 11: Create `apps/web/src/router.ts`**

```ts
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

Note: `routeTree.gen.ts` is auto-generated by `@tanstack/router-plugin` on first Vite run. Do not create it manually.

- [ ] **Step 12: Create `apps/web/src/routes/__root.tsx`**

```tsx
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { Toaster } from '@market/ui';

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
});
```

- [ ] **Step 13: Create `apps/web/src/routes/index.tsx`**

```tsx
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
```

- [ ] **Step 14: Create `apps/web/src/app.tsx`**

```tsx
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './router.js';
import { queryClient } from './query-client.js';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 15: Create `apps/web/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 16: Create `apps/web/src/styles.css`**

```css
@import '@market/ui/styles.css';
```

---

## Task 21: Root Dockerfile, docker-compose, .env.example, README

**Purpose:** Production multi-stage Dockerfile via `turbo prune`, dev `docker-compose.yml` defaulting to Postgres-only, expanded `.env.example`, new `README.md`.

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.env.example` (replace root stub from Task 2)
- Create: `README.md` (overwrite legacy)

**Source reference for `Dockerfile` and `docker-compose.yml`:** `docs/superpowers/specs/2026-04-15-market-monorepo-design.md §5.9`. Copy both code blocks verbatim.

- [ ] **Step 1: Create `Dockerfile`**

Open the spec at §5.9, find the Dockerfile code block (starts `FROM node:22-alpine AS base`), copy it verbatim into `Dockerfile` at the repo root.

- [ ] **Step 2: Create `docker-compose.yml`**

In the same §5.9, find the `docker-compose.yml` code block, copy it verbatim into `docker-compose.yml` at the repo root.

- [ ] **Step 3: Create `.dockerignore`**

```
node_modules
.pnpm-store
**/node_modules
**/dist
**/build
**/.turbo
.legacy
.git
.github
docs
*.log
.env
.env.local
```

- [ ] **Step 4: Overwrite root `.env.example`**

Open the spec at §5.10 and copy the `.env.example` block verbatim, replacing the stub from Task 2.

- [ ] **Step 5: Overwrite root `README.md`**

```markdown
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
```

---

## Task 22: Delete legacy `.legacy/` staging

**Purpose:** Remove legacy source now that everything has been ported.

**Files:**
- Delete: `.legacy/`

- [ ] **Step 1: Confirm all legacy files have been ported**

Run:
```bash
ls .legacy/
```
Expected: `src/`, `wolt.sqlite`, `package.json`, `tsconfig.json`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`.

Verify each of the following has a corresponding port in the new structure (read the new file to confirm):
- `.legacy/src/wolt/client.ts` → `packages/vendors/wolt/src/client.ts`
- `.legacy/src/db/store.ts` → `apps/api/src/services/catalog.ts`
- `.legacy/src/services/shoppingList.ts` → `apps/api/src/services/shopping-list.ts`
- `.legacy/src/crawler/crawl.ts` → `apps/api/src/crawler/crawl.ts`
- `.legacy/src/server.ts` → `apps/mcp/src/server.ts` + `apps/mcp/src/tools.ts`
- `.legacy/src/config.ts` → `packages/vendors/wolt/src/config.ts` + `apps/api/src/environment.ts` + `apps/mcp/src/environment.ts`
- `.legacy/Dockerfile` / `docker-compose.yml` → root replacements

If any port is missing, STOP and fix before deleting.

- [ ] **Step 2: Delete `.legacy/`**

`.legacy/` was never committed (single final commit policy), so use plain `rm -rf`:

```bash
rm -rf .legacy
```

---

## Task 23: Install + build + lint + typecheck + circular verification

**Purpose:** First full install + end-to-end verification of every task command. Any failure here means a previous task is broken; fix there, don't work around here.

- [ ] **Step 1: Install dependencies**

Run:
```bash
pnpm install
```
Expected: pnpm creates `node_modules` + `pnpm-lock.yaml`, resolves workspace `workspace:*` deps as symlinks, no peer-dep errors.

- [ ] **Step 2: Build everything**

Run:
```bash
pnpm build
```
Expected: Turbo runs `build` in dependency order (`@market/config` first, then `@market/vendor-core`, then vendors, then `@market/contracts`, `@market/ui`, then apps). Every package emits `dist/` with `.js` + `.d.ts`. Exit code 0.

If TypeScript errors appear, read them and fix in the originating task's file — do NOT add `// @ts-ignore`.

- [ ] **Step 3: Typecheck**

Run:
```bash
pnpm typecheck
```
Expected: all `tsc --noEmit` runs pass. Exit 0.

- [ ] **Step 4: Lint**

Run:
```bash
pnpm lint
```
Expected: all eslint runs pass. Common failures:
- `no-restricted-properties` on `process.env.*` — means an env read slipped outside `environment.ts`. Move it.
- `boundaries/element-types` — means an illegal cross-package import. Check the dependency graph in spec §2.
- `@typescript-eslint/no-unused-vars` — remove the unused variable.

- [ ] **Step 5: Circular deps check**

Run:
```bash
pnpm check:circular
```
Expected: madge reports `✓ No circular dependencies found` for every package.

- [ ] **Step 6: Generate initial migration**

Run:
```bash
pnpm db:generate
```
Expected: `apps/api/drizzle/0000_*.sql` is created with `CREATE EXTENSION` statements (drizzle-kit emits pgcrypto/pg_trgm/vector if declared) plus all tables.

If the migration file is missing the extension CREATEs, prepend them manually at the top of the generated SQL file:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Task 24: End-to-end smoke test

**Purpose:** Verify a full happy-path loop: postgres → migrate → crawl one venue → query via REST → query via MCP stdio → render in web UI.

**Files:** none (pure verification)

- [ ] **Step 1: Start Postgres**

Run:
```bash
docker compose up -d postgres
docker compose logs -f postgres  # Ctrl+C when "database system is ready to accept connections"
```

- [ ] **Step 2: Run migrations**

Run:
```bash
cp .env.example .env
# Edit .env: set OPENAI_API_KEY (or switch EMBEDDER to a provider you have) and API_TOKEN
pnpm db:migrate
```
Expected: `drizzle-kit migrate` applies all migrations. Then verify:

```bash
docker compose exec postgres psql -U market -d market -c "\dt"
```
Expected rows: `venues`, `categories`, `items`, `item_embeddings`, `embedding_jobs`, `price_observations`.

```bash
docker compose exec postgres psql -U market -d market -c "SELECT extname FROM pg_extension;"
```
Expected: includes `pgcrypto`, `pg_trgm`, `vector`.

- [ ] **Step 3: Start api**

Run in terminal A:
```bash
pnpm --filter @market/api dev
```
Expected: log lines `listening on :3000` and `embedding worker started`. If the worker logs `tick failed` repeatedly with no jobs, that's fine — the queue is empty.

- [ ] **Step 4: Crawl one venue**

Run in terminal B:
```bash
# Pick a real grocery slug. carrefour-express-tbilisi is a reasonable test.
pnpm crawl -- --vendor wolt --venue carrefour-express-tbilisi
```
Expected: log lines showing `discovering venues... found N venues`, then `[wolt] 0/1 carrefour-express-tbilisi`, and a final `done. venues=N items=M errors=E`.

- [ ] **Step 5: Verify items were persisted**

Run:
```bash
curl -s 'http://localhost:3000/v1/catalog/stats' | jq
```
Expected: `items` and `venues` counts > 0. `itemsWithEmbedding` may be 0 initially — watch `pnpm --filter @market/api dev` output; after up to 60 seconds the embedding worker should have processed the queued jobs. Re-run the stats call:

```bash
curl -s 'http://localhost:3000/v1/catalog/stats' | jq
```
Expected: `itemsWithEmbedding` now equals `items`.

- [ ] **Step 6: Hybrid search via REST**

Run:
```bash
curl -s 'http://localhost:3000/v1/catalog/search?q=milk&mode=hybrid' | jq '.items[0:3]'
```
Expected: at least one result with `name`, `priceMinor`, `currency`, `venueSlug`, `score`.

- [ ] **Step 7: Shopping list via REST**

Run:
```bash
curl -s -X POST http://localhost:3000/v1/shopping-list \
  -H 'content-type: application/json' \
  -d '{"strategy":"both","items":[{"query":"milk"},{"query":"bread"}]}' | jq
```
Expected: both `cheapestPerItem` and `singleStore` plans present.

- [ ] **Step 8: MCP stdio sanity check**

Run in terminal C:
```bash
# Start mcp against the running api. Use the same API_URL and API_TOKEN as .env.
API_URL=http://localhost:3000 API_TOKEN=devtoken NODE_ENV=development pnpm --filter @market/mcp dev
```
Expected: `stdio ready — api=http://localhost:3000`. Then send a list-tools request via stdin:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | API_URL=http://localhost:3000 API_TOKEN=devtoken NODE_ENV=development pnpm --filter @market/mcp exec node dist/server.js
```
Expected: JSON response listing all 9 `market_*` tools. Then test a tool call:

```bash
(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' ; echo '{"jsonrpc":"2.0","method":"notifications/initialized"}' ; echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"market_catalog_stats","arguments":{}}}') | API_URL=http://localhost:3000 API_TOKEN=devtoken NODE_ENV=development node apps/mcp/dist/server.js
```
Expected: JSON response containing the catalog stats.

- [ ] **Step 9: Web UI smoke test**

Run in terminal D:
```bash
pnpm --filter @market/web dev
```
Open `http://localhost:5173` in a browser. Type `milk` in the search box and submit.
Expected: the search page shows item cards with name, venue, vendor, and price. No console errors.

- [ ] **Step 10: Final state sanity**

Run:
```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm check:circular
```
Expected: all four commands exit 0. This is the final gate — only call Task 24 complete when all four pass.

---

## Task 25: Final commit (invoke `/commit` skill)

**Purpose:** After 24 tasks of uncommitted scaffolding, hand off the entire working tree to the `/commit` skill so it can group files into logical chunks, generate conventional-commits messages, and get user approval per chunk. Do NOT run `git add` / `git commit` directly — memory rule `feedback_commit_workflow.md` forbids it.

**Files:** none (pure workflow)

- [ ] **Step 1: Sanity check the working tree**

Run:
```bash
git status
```
Expected: a large list of untracked and modified files across `apps/`, `packages/`, root config files, root Dockerfile/compose, README.md, etc. `.legacy/` should be gone (deleted in Task 22).

- [ ] **Step 2: Invoke the `/commit` skill**

From the parent session (not a subagent — subagents cannot invoke user skills), run the `commit` skill via the Skill tool:

```
Skill(commit)
```

The skill will:
1. Scan the working tree, read diffs, detect temp files.
2. Group files into logical chunks (e.g. workspace root, `@market/config`, vendors, api, mcp, web, docker/readme).
3. Generate a conventional-commits message per chunk.
4. Present the plan for user approval (`y` / `n` / `edit`).
5. On approval, commit each chunk sequentially.

- [ ] **Step 3: Verify the commit history**

After the skill finishes:
```bash
git log --oneline
```
Expected: a clean sequence of conventional commits covering the entire monorepo scaffold, no stray files left uncommitted (other than gitignored build artefacts).

Run:
```bash
git status
```
Expected: `nothing to commit, working tree clean` (except for gitignored paths like `node_modules/`, `dist/`, `.turbo/`, `.env`).

---

## Self-Review Notes

Before concluding, the plan author reviewed against the spec:

**Spec coverage:**
- §1 Repo layout → Tasks 1, 2, 9, 19, 20 (scaffold all directories and root)
- §2 Dependency graph → Task 3 (boundaries eslint config)
- §3.1 Vendor interface → Task 4
- §3.2 Data flow → covered by combination of 13, 15, 18 (api owns DB + worker + HTTP)
- §3.3 REST surface → Task 16 (all 6 endpoints + admin)
- §3.4 MCP tool renames → Task 19
- §4.1 Sizing → informational, no task (decisions baked into §4.3 schema)
- §4.2 Postgres extensions → Task 23 step 6 (manual migration prepend)
- §4.3 Drizzle schema → Task 10 (references spec §4.3)
- §4.4 Embeddings → Task 11 (embedder providers) + Task 15 (worker)
- §4.5 Hybrid search → Task 13 (SQL inlined from spec §4.5)
- §4.6 Dedup hook → schema covers it (Task 10 `gtin` index); no code needed in v1
- §5.1 pnpm workspace → Task 2
- §5.2 Turbo → Task 2
- §5.3 `@market/config` → Task 3
- §5.4 TypeScript base → Task 3
- §5.5 madge → Task 3
- §5.6 Prettier → Task 3
- §5.7 Per-package scripts → each package task uses the convention
- §5.8 environment.ts per app → Tasks 9 (api), 19 (mcp), 20 (web)
- §5.9 Docker → Task 21
- §5.10 `.env.example` → Task 21
- §6.1 File mapping → Tasks 1 (stage) + 5 (wolt client) + 13 (catalog) + 14 (shopping list) + 17 (crawler) + 19 (mcp) + 22 (delete)
- §6.2 New files → covered across every task
- §6.3 Ordering → Task order follows the spec's ordering
- §6.4 Non-goals → honored (no tests, no UI beyond search, vendor stubs)
- §7 Deferred → not implemented (intentional)

**Type consistency spot-checks:**
- `VendorId` string literal is identical across `@market/vendor-core/types.ts`, `@market/contracts/common.ts`, `apps/api/src/environment.ts`, `apps/mcp/src/tools.ts` (zod enum).
- `priceMinor` (contract/api) vs `price_minor` (DB column) vs `price` (legacy) — the seam is the catalog service, which converts; confirmed in Task 13.
- `searchItemsHybrid`, `searchItemsKeyword`, `searchItemsByBarcode` are defined in Task 13 and referenced by Task 14 (shopping-list) + Task 16 (routes) under the same names.
- `getEmbedder()` from `apps/api/src/embeddings/index.ts` is the only embedder factory; referenced from `server.ts` (Task 18) and `shopping-list.ts` (Task 14).

**Placeholder scan:** No TODO/TBD/FIXME left in the plan. Two explicit "reference the spec at §X" pointers exist for large code blocks (Task 10 drizzle schema, Task 13 hybrid SQL, Task 21 Dockerfile/compose/env); these point to committed content in the same repo and the executing agent must read the spec.

**Known wrinkles the executor should expect:**
- No mid-task commits — everything stays in the working tree until Task 25, which invokes the `/commit` skill for a grouped final commit. `git mv` / `git rm` are avoided in Tasks 1 and 22 because the files are untracked; plain `mv` / `rm -rf` are used instead.
- `routeTree.gen.ts` in `apps/web` is auto-generated on first `vite dev` run. It will be untracked and should be included in the final `/commit` run (Task 25).
- The initial drizzle-kit migration does NOT emit `CREATE EXTENSION` statements. Task 23 step 6 instructs prepending them manually to the first migration file.
- Drizzle's `customType` for `vector(1024)` returns strings from the driver; the `fromDriver` parses via `JSON.parse`. pgvector text format `"[1,2,3]"` is valid JSON, so this works — but do not try to return arrays for `<=>` distance operators, always pass literal `'[...]'::vector(1024)` casts in raw SQL (see Task 13).
- Fastify v5 + `@fastify/type-provider-standard-schema` — if that package's API doesn't match the snippet in Task 16, the plan falls back to manual `v.safeParse` at the top of each handler, which is what Task 16 actually does. The type-provider is NOT wired; it's listed as a dependency for future use.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-market-monorepo-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration, protected context window.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?






