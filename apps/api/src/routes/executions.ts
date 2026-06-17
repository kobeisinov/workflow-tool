import { FastifyInstance } from "fastify";
import { query } from "../db/connection";
import { getAuthUser } from "./auth";

export async function executionRoutes(app: FastifyInstance) {
  // List executions for a workflow
  app.get("/workflows/:id/executions", async (req, reply) => {
    const user = await getAuthUser(req.headers.authorization);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = req.params as { id: string };

    // Verify ownership
    const wf = await query(`SELECT id FROM workflows WHERE id=$1 AND owner_id=$2`, [
      id,
      user.userId,
    ]);
    if (!wf.rows[0]) return reply.status(404).send({ error: "Not found" });

    const result = await query(
      `SELECT id, workflow_id, status, mode, error, started_at, finished_at
       FROM executions WHERE workflow_id=$1 ORDER BY started_at DESC LIMIT 50`,
      [id]
    );
    return reply.send(result.rows);
  });

  // Get a single execution with node runs
  app.get("/executions/:id", async (req, reply) => {
    const user = await getAuthUser(req.headers.authorization);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = req.params as { id: string };

    const execResult = await query(
      `SELECT e.*, w.owner_id FROM executions e
       JOIN workflows w ON w.id = e.workflow_id
       WHERE e.id=$1`,
      [id]
    );
    const exec = execResult.rows[0] as (Record<string, unknown> & { owner_id: string }) | undefined;
    if (!exec || exec.owner_id !== user.userId) {
      return reply.status(404).send({ error: "Not found" });
    }

    const nodeRuns = await query(
      `SELECT id, node_id, node_type, status, input, output, error, started_at, finished_at
       FROM node_runs WHERE execution_id=$1 ORDER BY started_at`,
      [id]
    );

    const { owner_id: _removed, ...executionData } = exec;
    return reply.send({ ...executionData, nodeRuns: nodeRuns.rows });
  });
}
