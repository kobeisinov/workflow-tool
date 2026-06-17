FROM node:20-alpine AS builder
RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --no-frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN pnpm --filter @workflow-tool/shared build
RUN pnpm --filter web build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
