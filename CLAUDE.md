# CLAUDE.md — Workflow Automation Tool (internal, n8n-lite)

This file is the build spec and the operating contract for working on this repo.
Read it fully before writing code. When in doubt, prefer the **simplest thing
that satisfies the acceptance criteria** — this is a tight-deadline internal
tool, not a product. Do not add features, libraries, or abstractions that aren't
called for here without asking.

---

## 1. What we're building

An internal workflow automation tool (think a tiny n8n) for a ~50-person company
(marketing + dev teams). A user visually builds a **workflow** — a directed
acyclic graph (DAG) of **nodes** — on a canvas. A *trigger* node starts a run;
*action* nodes do work and pass their output to the next node. When a workflow is
**active**, it runs automatically when its trigger fires.

Audience is small, internal, and trusted. Optimize for clarity and a working
end-to-end demo over scale or hardening.

---

## 2. Scope (READ THIS — it's the most important section)

### In scope (build these)
- Create / edit / list / delete workflows on a visual canvas.
- Activate / deactivate a workflow.
- Three trigger types: **manual run**, **webhook**, **schedule (cron)**.
- Node-by-node **DAG execution** with data passed from each node to the next.
- A small node library: `webhook`, `manual`, `schedule` (triggers) +
  `httpRequest`, `if`, `set` (actions).
- **Execution history**: list past runs + open a run to see per-node input/output
  and status. This is the debugging view; it matters.
- Async execution via a **Postgres `jobs` table polled by an in-process worker**.
- Trivial auth: seeded users, email+password, session cookie or simple JWT.
- One-command local startup + a seed script.

### Out of scope (do NOT build unless asked)
- Redis, Kafka, or any external broker. The queue is a Postgres table.
- Credential vault / OAuth flows (store any secret in an env var or a plain
  encrypted column; do not build a vault).
- Workflow versioning, real-time collaboration, RBAC beyond basic login.
- Sandboxing untrusted code / a `code` node. Users are trusted; skip it.
- Multi-tenancy isolation, geo-sharding, horizontal scaling, microservices.
- Per-node checkpoint/resume durability. At-least-once + "re-run from start on
  crash" is acceptable; note the limitation in the README.
- Multi-input **merge/join** nodes with full join semantics — see §6 for the
  v1 simplification. Don't rabbit-hole here.

If a task seems to require something in the "out of scope" list, stop and flag it.

---

## 3. Tech stack (decided — do not swap)

- **Language:** TypeScript everywhere, `strict: true`.
- **Frontend:** Vite + React + **React Flow** (`@xyflow/react`, v12). Tailwind +
  a light component set (shadcn/ui) for the non-canvas UI (forms, tables) is fine.
- **Backend:** **Fastify** (TypeScript).
- **DB:** **PostgreSQL**. Use `node-postgres` (`pg`) with plain SQL, or Drizzle if
  preferred. (Prisma allowed only if it speeds you up — not required.)
- **Queue:** a Postgres `jobs` table, polled by an in-process worker. **No Redis.**
- **Scheduling:** `node-cron` (or a simple `setInterval` scan of due schedules) in
  the same backend process.
- **Validation:** **Zod** is recommended for validating request bodies and the
  workflow graph, and integrates with Fastify via `fastify-type-provider-zod`.
  The hard requirement is that **the workflow graph is validated before the
  engine touches it** (see §6); Zod is the suggested means, not mandatory.
- **Deploy target:** local only. `docker compose up` (app + Postgres) is the goal.

---

## 4. Repo structure

A small pnpm monorepo so the frontend and backend share the workflow type/contract.

```
/
├─ docker-compose.yml          # app + postgres, one command
├─ package.json                # pnpm workspaces
├─ README.md                   # setup + demo script (see §10)
├─ packages/
│  └─ shared/                  # the spine: workflow types + zod schemas
│     └─ src/workflow.ts       # WorkflowSchema, NodeSchema, types (z.infer)
├─ apps/
│  ├─ api/                     # Fastify server + worker + engine
│  │  └─ src/
│  │     ├─ index.ts           # server bootstrap (starts API + worker loop)
│  │     ├─ db/                # connection, migrations, seed
│  │     ├─ routes/            # workflows, executions, webhook, auth
│  │     ├─ engine/            # DAG executor + node registry  ← core
│  │     │  ├─ executor.ts
│  │     │  ├─ registry.ts
│  │     │  └─ nodes/          # one file per node type
│  │     ├─ queue/             # jobs table: enqueue + worker poll loop
│  │     └─ triggers/          # webhook routing + cron scheduler
│  └─ web/                     # Vite + React + React Flow editor
│     └─ src/
│        ├─ Canvas.tsx         # React Flow canvas + palette + param panel
│        ├─ Executions.tsx     # run history + run detail
│        └─ lib/transform.ts   # React Flow <-> Workflow JSON mapping
```

---

## 5. Data model (Postgres)

Keep it minimal. Graph lives as JSONB; execution data is the high-volume part.

```sql
users        (id, email UNIQUE, password_hash, created_at)

workflows    (id, owner_id -> users, name,
              graph JSONB,            -- { nodes:[...], connections:[...] }
              active BOOLEAN DEFAULT false,
              webhook_path TEXT UNIQUE NULL,   -- set when a webhook trigger exists
              cron TEXT NULL,                  -- set when a schedule trigger exists
              created_at, updated_at)

executions   (id, workflow_id -> workflows,
              status TEXT,            -- queued | running | success | error
              mode TEXT,              -- manual | webhook | schedule
              trigger_payload JSONB NULL,
              error TEXT NULL,
              started_at, finished_at)

node_runs    (id, execution_id -> executions,
              node_id TEXT, node_type TEXT,
              status TEXT,            -- success | error | skipped
              input JSONB, output JSONB,
              error TEXT NULL,
              started_at, finished_at)

jobs         (id, execution_id -> executions,
              status TEXT DEFAULT 'pending',  -- pending | processing | done | failed
              attempts INT DEFAULT 0,
              run_after TIMESTAMPTZ DEFAULT now(),  -- for delayed/retry
              locked_at TIMESTAMPTZ NULL,
              created_at)
-- index: jobs (status, run_after) WHERE status = 'pending'
```

For this scale, storing node input/output inline in `node_runs.input/output` JSONB
is fine. No object storage.

---

## 6. The core contract: the workflow graph + execution

### Graph shape (lives in `packages/shared`)
```ts
type NodeType =
  | "manual" | "webhook" | "schedule"      // triggers
  | "httpRequest" | "if" | "set";          // actions

interface WorkflowNode {
  id: string;
  type: NodeType;
  params: Record<string, unknown>;   // node-specific config
  position: { x: number; y: number };// for the canvas
}

interface Connection {
  from: string;           // node id
  fromPort?: string;      // default "main"; "if" uses "true" | "false"
  to: string;             // node id
}

interface Workflow {
  name: string;
  nodes: WorkflowNode[];
  connections: Connection[];
}
```

### Two validation layers (both required before saving/executing)
1. **Structural** (Zod or manual): correct shapes, known node types, unique node ids.
2. **Graph-semantic** (`validateGraph(workflow)`): every connection endpoint
   references a real node id; exactly one reachable trigger; **the graph is
   acyclic** (reject cycles — they would hang the executor).

### The node interface (the key abstraction — everything plugs into this)
```ts
interface NodeContext { /* logger, fetch, execution metadata */ }

interface NodeResult {
  // map of output port -> data emitted on that port
  // most nodes emit { main: {...} }; "if" emits { true: {...} } OR { false: {...} }
  outputs: Record<string, unknown>;
}

interface NodeRunner {
  type: NodeType;
  run(input: unknown, params: Record<string, unknown>, ctx: NodeContext)
    : Promise<NodeResult>;
}
```
Register each node in `engine/registry.ts`. **Adding a new integration = adding one
file in `engine/nodes/` + one registry entry.** Preserve this property.

### The executor (topological walk)
Pseudocode — implement in `engine/executor.ts`:
```
load workflow + build adjacency (from -> [{to, fromPort}]) and parent counts
mark trigger node(s) ready with the trigger payload as input
while ready not empty:
    node   = ready.pop()
    input  = merged outputs delivered to this node by its parents
    result = registry[node.type].run(input, node.params, ctx)
    persist node_run(node, input, result, status)
    for each port in result.outputs:
        for each child connected from (node, port):
            deliver result.outputs[port] to child
            if all of child's *active* parents have delivered -> ready.push(child)
    # ports that did NOT fire (e.g. the false branch of an `if`):
    # mark exclusively-downstream nodes as skipped so they never block.
mark execution success (or error if a node threw with no error handling)
```

**v1 simplification:** the common shapes are linear chains and `if`-branches.
A node with multiple incoming edges (a true merge/join) may run as soon as its
first active parent delivers — full join semantics are out of scope. Document this.

---

## 7. Triggers

- **manual:** `POST /workflows/:id/run` → create execution → enqueue job. Used by
  the "Run" button in the editor.
- **webhook:** on activate, set `workflows.webhook_path`. A public
  `POST /webhook/:path` looks up the workflow, creates a `queued` execution with
  the request body as `trigger_payload`, enqueues a job, and returns `200`
  immediately (do NOT run the workflow inline in the request).
- **schedule:** on activate, register `workflows.cron`. A single cron scheduler in
  the backend scans active schedules and enqueues executions when due. (Single
  process, so no duplicate-firing concern.)

---

## 8. Queue + worker

- **enqueue:** insert a row into `jobs` (`status='pending'`).
- **worker loop:** poll on an interval; claim jobs atomically with
  `FOR UPDATE SKIP LOCKED` so it's safe even if you run more than one worker:
  ```sql
  UPDATE jobs SET status='processing', locked_at=now(), attempts=attempts+1
  WHERE id = (
    SELECT id FROM jobs
    WHERE status='pending' AND run_after <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
  ```
  Then run the execution via the engine; on success set `status='done'`, on
  failure set `status='failed'` (optionally re-queue with `run_after = now()+backoff`
  while `attempts < N`). The worker runs **in the same process** as the API for v1.

---

## 9. Conventions

- TypeScript `strict`. No `any` in committed code except at unavoidable JSON
  boundaries, and validate immediately there.
- Validate all external input (request bodies, webhook payloads) at the boundary.
- Fastify handlers may throw; let Fastify's error handling turn it into a response
  (this is a reason we chose Fastify — don't reintroduce manual try/catch everywhere).
- Keep the engine **pure and unit-testable**: the executor takes a workflow + input
  and a node registry; node side effects live inside node runners behind `ctx`.
- One node type per file. Small, composable functions over clever abstractions.
- Commit in vertical slices (see §11), each leaving the app runnable.

---

## 10. Running it (target experience)

```
docker compose up          # starts postgres + api + web
# or, without docker:
pnpm install
pnpm --filter api db:migrate && pnpm --filter api db:seed
pnpm dev                    # runs api + web concurrently
```

`README.md` must include a **demo script**, e.g.:
> 1. Log in as the seeded user.
> 2. Open the example "Webhook → HTTP → If → Set" workflow and Activate it.
> 3. `curl -X POST localhost:3000/webhook/demo -d '{"status":"ok"}'`.
> 4. Open Executions, click the latest run, see each node's input/output.

Seed must create one demo user + one working example workflow so the canvas isn't
empty on first load.

---

## 11. Build order (milestones — build a working vertical slice first)

Do these in order. Each milestone must end with the app in a runnable state.

**M0 — Scaffold.** Monorepo, `shared` package with the `Workflow` types/schema,
Fastify "hello", Vite React app, `docker-compose` with Postgres, migrations runner.
✅ `docker compose up` serves an empty API + web and connects to Postgres.

**M1 — Engine first, no UI.** Implement `node_runs`/`executions` tables, the node
registry with `manual` + `httpRequest` + `set` + `if`, and the executor.
Add `POST /workflows` (create, with validation) and `POST /workflows/:id/run`
(synchronous for now) + `GET /executions/:id`.
✅ Can POST a 3-node workflow JSON, run it, and read back per-node input/output.
✅ Unit tests cover the executor: linear chain, `if` branch, cycle rejection.

**M2 — Make it async.** Add the `jobs` table + worker loop (`SKIP LOCKED`).
`/run` now enqueues and returns immediately; the worker executes.
✅ Running a workflow creates a `queued`→`running`→`success` execution via the worker.

**M3 — Webhook + schedule triggers.** Activation sets `webhook_path`/`cron`.
`POST /webhook/:path` and the cron scanner enqueue executions.
✅ A curl to the webhook URL triggers a run; an active cron workflow runs on schedule.

**M4 — The canvas.** React Flow editor: node palette, drag/connect, per-node param
panel, save (map React Flow nodes/edges ⇄ Workflow JSON in `lib/transform.ts`),
Activate/Deactivate, Run button.
✅ Can build and save a workflow entirely in the UI and run it.

**M5 — Execution history UI.** List runs for a workflow; open a run to see status +
per-node input/output. Auto-refresh while running.
✅ The demo script in §10 works end to end from the UI.

**M6 — Polish.** Basic auth + seed user + example workflow, README with demo script,
`docker compose up` works from clean checkout.
✅ Fresh clone → one command → working demo.

If time runs short, ship through M3 + a minimal M4/M5; a working engine with a
thin UI beats a rich canvas with no engine. Note any cuts in the README.

---

## 12. Definition of done
- Fresh clone starts with one command and a seeded demo workflow.
- A workflow can be built in the UI, activated, triggered (manual/webhook/cron),
  executed asynchronously via the Postgres-backed worker, and inspected run-by-run.
- The executor has unit tests (chain, branch, cycle rejection).
- README documents setup, the demo script, and explicitly what was cut and why.
