import { pool, query } from "../db/connection";
import { executeWorkflow } from "../engine/executor";
import { Workflow } from "@workflow-tool/shared";

const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3;

async function claimJob(): Promise<{ id: string; execution_id: string } | null> {
  const result = await pool.query<{ id: string; execution_id: string }>(`
    UPDATE jobs SET status='processing', locked_at=now(), attempts=attempts+1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status='pending' AND run_after <= now()
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, execution_id
  `);
  return result.rows[0] ?? null;
}

async function processJob(job: { id: string; execution_id: string }) {
  const execResult = await query<{
    id: string;
    workflow_id: string;
    trigger_payload: unknown;
    mode: string;
  }>(
    `SELECT id, workflow_id, trigger_payload, mode FROM executions WHERE id = $1`,
    [job.execution_id]
  );

  const execution = execResult.rows[0];
  if (!execution) {
    await query(`UPDATE jobs SET status='failed' WHERE id=$1`, [job.id]);
    return;
  }

  const wfResult = await query<{ graph: Workflow }>(
    `SELECT graph FROM workflows WHERE id=$1`,
    [execution.workflow_id]
  );
  const workflow = wfResult.rows[0]?.graph;
  if (!workflow) {
    await query(`UPDATE jobs SET status='failed' WHERE id=$1`, [job.id]);
    return;
  }

  await query(
    `UPDATE executions SET status='running', started_at=now() WHERE id=$1`,
    [job.execution_id]
  );

  const ctx = {
    executionId: job.execution_id,
    workflowId: execution.workflow_id,
    log: (msg: string) => console.log(`[exec:${job.execution_id}] ${msg}`),
  };

  try {
    const result = await executeWorkflow(workflow, execution.trigger_payload, ctx);

    // Persist node runs
    for (const nr of result.nodeRuns) {
      await query(
        `INSERT INTO node_runs (execution_id, node_id, node_type, status, input, output, error, started_at, finished_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          job.execution_id,
          nr.nodeId,
          nr.nodeType,
          nr.status,
          JSON.stringify(nr.input),
          JSON.stringify(nr.output),
          nr.error ?? null,
          nr.startedAt,
          nr.finishedAt,
        ]
      );
    }

    if (result.status === "success") {
      await query(
        `UPDATE executions SET status='success', finished_at=now() WHERE id=$1`,
        [job.execution_id]
      );
      await query(`UPDATE jobs SET status='done' WHERE id=$1`, [job.id]);
    } else {
      await query(
        `UPDATE executions SET status='error', error=$2, finished_at=now() WHERE id=$1`,
        [job.execution_id, result.error ?? "Unknown error"]
      );
      await query(`UPDATE jobs SET status='failed' WHERE id=$1`, [job.id]);
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error(`[worker] Execution ${job.execution_id} crashed:`, err);

    const jobRow = await query<{ attempts: number }>(
      `SELECT attempts FROM jobs WHERE id=$1`,
      [job.id]
    );
    const attempts = jobRow.rows[0]?.attempts ?? MAX_ATTEMPTS;

    if (attempts < MAX_ATTEMPTS) {
      const backoff = Math.pow(2, attempts) * 5; // 5s, 10s, 20s
      await query(
        `UPDATE jobs SET status='pending', run_after=now()+($2 || ' seconds')::interval WHERE id=$1`,
        [job.id, backoff]
      );
    } else {
      await query(`UPDATE jobs SET status='failed' WHERE id=$1`, [job.id]);
      await query(
        `UPDATE executions SET status='error', error=$2, finished_at=now() WHERE id=$1`,
        [job.execution_id, err]
      );
    }
  }
}

export function startWorker() {
  console.log("[worker] Starting...");

  async function tick() {
    try {
      const job = await claimJob();
      if (job) {
        console.log(`[worker] Processing job ${job.id} (execution ${job.execution_id})`);
        await processJob(job);
      }
    } catch (e) {
      console.error("[worker] Poll error:", e);
    }
    setTimeout(tick, POLL_INTERVAL_MS);
  }

  tick();
}

export async function enqueueExecution(executionId: string) {
  await query(
    `INSERT INTO jobs (execution_id) VALUES ($1)`,
    [executionId]
  );
}
