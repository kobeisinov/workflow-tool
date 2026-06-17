import { FastifyInstance } from "fastify";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { WorkflowSchema, validateGraph } from "@workflow-tool/shared";
import { query } from "../db/connection";
import { enqueueExecution } from "../queue/worker";
import { getAuthUser } from "./auth";
import { startCronForWorkflow, stopCronForWorkflow } from "../triggers/scheduler";

export async function workflowRoutes(app: FastifyInstance) {
  // Helper: require auth
  async function requireAuth(req: { headers: { authorization?: string } }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
    const user = await getAuthUser(req.headers.authorization);
    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return null;
    }
    return user;
  }

  app.get("/workflows", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;

    const result = await query(
      `SELECT id, name, active, webhook_path, cron, created_at, updated_at FROM workflows WHERE owner_id=$1 ORDER BY created_at DESC`,
      [user.userId]
    );
    return reply.send(result.rows);
  });

  app.post("/workflows", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;

    const body = WorkflowSchema.parse(req.body);
    const graphError = validateGraph(body);
    if (graphError) return reply.status(400).send({ error: graphError.message });

    const result = await query<{ id: string }>(
      `INSERT INTO workflows (owner_id, name, graph) VALUES ($1,$2,$3) RETURNING id`,
      [user.userId, body.name, JSON.stringify(body)]
    );
    return reply.status(201).send(result.rows[0]);
  });

  app.get("/workflows/:id", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const result = await query(
      `SELECT * FROM workflows WHERE id=$1 AND owner_id=$2`,
      [id, user.userId]
    );
    if (!result.rows[0]) return reply.status(404).send({ error: "Not found" });
    return reply.send(result.rows[0]);
  });

  app.put("/workflows/:id", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const body = WorkflowSchema.parse(req.body);
    const graphError = validateGraph(body);
    if (graphError) return reply.status(400).send({ error: graphError.message });

    const result = await query(
      `UPDATE workflows SET name=$3, graph=$4, updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING *`,
      [id, user.userId, body.name, JSON.stringify(body)]
    );
    if (!result.rows[0]) return reply.status(404).send({ error: "Not found" });
    return reply.send(result.rows[0]);
  });

  app.delete("/workflows/:id", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    await stopCronForWorkflow(id);
    await query(`DELETE FROM workflows WHERE id=$1 AND owner_id=$2`, [id, user.userId]);
    return reply.status(204).send();
  });

  // Activate / Deactivate
  app.post("/workflows/:id/activate", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const wfResult = await query<{ graph: unknown; active: boolean; cron: string | null }>(
      `SELECT graph, active, cron FROM workflows WHERE id=$1 AND owner_id=$2`,
      [id, user.userId]
    );
    const wf = wfResult.rows[0];
    if (!wf) return reply.status(404).send({ error: "Not found" });

    // Determine webhook_path and cron from graph
    const graph = wf.graph as { nodes: Array<{ type: string; params: Record<string, unknown> }> };
    const triggerNode = graph.nodes.find((n) =>
      ["manual", "webhook", "schedule"].includes(n.type)
    );

    let webhookPath: string | null = null;
    let cronExpr: string | null = null;

    if (triggerNode?.type === "webhook") {
      webhookPath = (triggerNode.params.path as string) ?? uuidv4().split("-")[0];
    }
    if (triggerNode?.type === "schedule") {
      cronExpr = (triggerNode.params.cron as string) ?? null;
    }

    await query(
      `UPDATE workflows SET active=true, webhook_path=$2, cron=$3, updated_at=now() WHERE id=$1`,
      [id, webhookPath, cronExpr]
    );

    if (cronExpr) {
      await startCronForWorkflow(id, cronExpr);
    }

    return reply.send({ activated: true, webhookPath, cron: cronExpr });
  });

  app.post("/workflows/:id/deactivate", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    await stopCronForWorkflow(id);
    await query(
      `UPDATE workflows SET active=false, updated_at=now() WHERE id=$1 AND owner_id=$2`,
      [id, user.userId]
    );
    return reply.send({ deactivated: true });
  });

  // Manual run
  app.post("/workflows/:id/run", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const wfResult = await query(`SELECT id FROM workflows WHERE id=$1 AND owner_id=$2`, [
      id,
      user.userId,
    ]);
    if (!wfResult.rows[0]) return reply.status(404).send({ error: "Not found" });

    const execResult = await query<{ id: string }>(
      `INSERT INTO executions (workflow_id, status, mode, trigger_payload) VALUES ($1,'queued','manual',$2) RETURNING id`,
      [id, JSON.stringify(req.body ?? {})]
    );
    const executionId = execResult.rows[0].id;
    await enqueueExecution(executionId);

    return reply.status(202).send({ executionId });
  });
}
