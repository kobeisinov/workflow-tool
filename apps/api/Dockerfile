FROM node:20-alpine AS base
RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --no-frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm --filter @workflow-tool/shared build
RUN pnpm --filter api build

WORKDIR /app/apps/api
RUN node -e "require('./dist/db/migrate')" || true

CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && node dist/index.js"]
