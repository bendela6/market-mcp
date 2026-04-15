FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @market/api @market/mcp --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@market/api --filter=@market/mcp

FROM base AS api
WORKDIR /app
COPY --from=installer /app .
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]

FROM base AS mcp
WORKDIR /app
COPY --from=installer /app .
WORKDIR /app/apps/mcp
CMD ["node", "dist/server.js"]
