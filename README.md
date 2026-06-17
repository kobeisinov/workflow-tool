# Workflow Tool

An internal workflow automation tool (think tiny n8n) for visually building and running DAG workflows.

## Quick Start

### Option 1: Docker (recommended)

```bash
docker compose up
```

This starts PostgreSQL, the API (port 3000), and the web UI (port 5173).
Migrations and seed run automatically.

### Option 2: Local dev

```bash
# Prerequisites: Node 20+, pnpm, PostgreSQL running on localhost:5432

pnpm install

# Run migrations and seed
pnpm --filter api db:migrate
pnpm --filter api db:seed

# Start both API and web
pnpm dev
```

- API: http://localhost:3000
- Web: http://localhost:5173

### Environment variables (API)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://workflow:workflow@localhost:5432/workflow` | Postgres URL |
| `PORT` | `3000` | API port |
| `JWT_SECRET` | `dev-secret-change-in-prod` | JWT signing secret |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |

---

## Demo Script

1. Open http://localhost:5173 and log in with:
   - Email: `demo@example.com`
   - Password: `password123`

2. Click the **"Webhook → HTTP → If → Set"** workflow to open the canvas.

3. Click **Activate** — the workflow gets a webhook path `/webhook/demo`.

4. Trigger it via curl:
   ```bash
   curl -X POST http://localhost:3000/webhook/demo \
     -H "Content-Type: application/json" \
     -d '{"status":"ok"}'
   ```

5. Click **Executions** in the top toolbar — you'll see the new run appear (it auto-refreshes).

6. Click the run to see each node's input/output and status. The `if` node routes to `set-true` since `status === "ok"`.

7. Try the false branch:
   ```bash
   curl -X POST http://localhost:3000/webhook/demo \
     -H "Content-Type: application/json" \
     -d '{"status":"fail"}'
   ```
   Now `set-false` runs and `set-true` is skipped.

---

## Architecture

### Monorepo layout

```
packages/shared/     — Workflow types + Zod schemas (shared between API and web)
apps/api/            — Fastify server + async worker + execution engine
apps/web/            — Vite + React + React Flow canvas
```

### Execution model

1. A trigger fires (manual click, webhook POST, or cron schedule).
2. An `executions` row is created with `status='queued'`, and a `jobs` row is inserted.
3. The in-process worker polls `jobs` using `FOR UPDATE SKIP LOCKED` and executes the DAG.
4. Each node's input/output is persisted in `node_runs`.
5. The execution status updates to `success` or `error`.

### Node types

| Type | Category | Description |
|---|---|---|
| `manual` | Trigger | Started by the Run button or `POST /workflows/:id/run` |
| `webhook` | Trigger | Fires on `POST /webhook/:path` |
| `schedule` | Trigger | Fires on a cron expression |
| `httpRequest` | Action | Makes an HTTP request |
| `if` | Action | Branches on a field comparison; emits `true` or `false` port |
| `set` | Action | Merges fixed key-value pairs into the data payload |

### Adding a new node type

1. Create `apps/api/src/engine/nodes/myType.ts` implementing `NodeRunner`.
2. Import it in `apps/api/src/engine/executor.ts`.
3. Add `"myType"` to `NodeTypeSchema` in `packages/shared/src/workflow.ts`.
4. Add param schema to `NODE_PARAM_SCHEMAS` in `apps/web/src/ParamPanel.tsx`.

---

## Running Tests

```bash
pnpm --filter api test
```

Tests cover: linear chain execution, `if` true/false branch routing, cycle rejection, missing trigger rejection.

---

## What Was Cut (v1 limitations)

- **Multi-input merge/join nodes**: A node with multiple incoming edges runs when its *first* active parent delivers output — not when all parents have fired. Full join semantics are out of scope.
- **At-least-once execution**: On worker crash, a job stuck in `processing` won't auto-retry until the process restarts. A future improvement would add a heartbeat timeout to re-queue stale jobs.
- **Credential vault**: Secrets (e.g., API keys for HTTP nodes) are stored as plain text in node params. No encryption or vault in v1.
- **Code node**: Skipped — users are trusted internal users and the sandboxing complexity isn't justified.
- **Real-time collaboration / workflow versioning**: Out of scope.
