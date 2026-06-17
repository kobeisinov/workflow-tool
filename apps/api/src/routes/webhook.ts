import { FastifyInstance } from "fastify";
import { query } from "../db/connection";
import { enqueueExecution } from "../queue/worker";

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhook/:path", async (req, reply) => {
    const { path } = req.params as { path: string };

    const wfResult = await query<{ id: string }>(
      `SELECT id FROM workflows WHERE webhook_path=$1 AND active=true`,
      [path]
    );
    const wf = wfResult.rows[0];
    if (!wf) return reply.status(404).send({ error: "Webhook not found" });

    const execResult = await query<{ id: string }>(
      `INSERT INTO executions (workflow_id, status, mode, trigger_payload)
       VALUES ($1,'queued','webhook',$2) RETURNING id`,
      [wf.id, JSON.stringify(req.body ?? {})]
    );
    const executionId = execResult.rows[0].id;
    await enqueueExecution(executionId);

    return reply.status(200).send({ received: true, executionId });
  });
}
