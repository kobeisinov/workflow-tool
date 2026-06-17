import cron from "node-cron";
import { query } from "../db/connection";
import { enqueueExecution } from "../queue/worker";

const activeCrons = new Map<string, cron.ScheduledTask>();

export async function startCronForWorkflow(workflowId: string, cronExpr: string) {
  stopCronForWorkflow(workflowId);

  if (!cron.validate(cronExpr)) {
    console.warn(`[scheduler] Invalid cron expression for workflow ${workflowId}: ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, async () => {
    try {
      const execResult = await query<{ id: string }>(
        `INSERT INTO executions (workflow_id, status, mode) VALUES ($1,'queued','schedule') RETURNING id`,
        [workflowId]
      );
      await enqueueExecution(execResult.rows[0].id);
      console.log(`[scheduler] Enqueued execution for workflow ${workflowId}`);
    } catch (e) {
      console.error(`[scheduler] Failed to enqueue for workflow ${workflowId}:`, e);
    }
  });

  activeCrons.set(workflowId, task);
  console.log(`[scheduler] Started cron "${cronExpr}" for workflow ${workflowId}`);
}

export async function stopCronForWorkflow(workflowId: string) {
  const task = activeCrons.get(workflowId);
  if (task) {
    task.stop();
    activeCrons.delete(workflowId);
    console.log(`[scheduler] Stopped cron for workflow ${workflowId}`);
  }
}

export async function loadActiveSchedules() {
  const result = await query<{ id: string; cron: string }>(
    `SELECT id, cron FROM workflows WHERE active=true AND cron IS NOT NULL`
  );
  for (const wf of result.rows) {
    await startCronForWorkflow(wf.id, wf.cron);
  }
  console.log(`[scheduler] Loaded ${result.rows.length} active schedules`);
}
