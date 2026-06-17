import { z } from "zod";

export const NodeTypeSchema = z.enum([
  "manual",
  "webhook",
  "schedule",
  "httpRequest",
  "if",
  "set",
]);

export type NodeType = z.infer<typeof NodeTypeSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeSchema,
  params: z.record(z.unknown()),
  position: z.object({ x: z.number(), y: z.number() }),
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const ConnectionSchema = z.object({
  from: z.string().min(1),
  fromPort: z.string().default("main"),
  to: z.string().min(1),
});

export type Connection = z.infer<typeof ConnectionSchema>;

export const WorkflowSchema = z.object({
  name: z.string().min(1),
  nodes: z.array(WorkflowNodeSchema),
  connections: z.array(ConnectionSchema),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

export type ExecutionStatus = "queued" | "running" | "success" | "error";
export type ExecutionMode = "manual" | "webhook" | "schedule";
export type NodeRunStatus = "success" | "error" | "skipped";

export interface GraphValidationError {
  message: string;
}

export function validateGraph(workflow: Workflow): GraphValidationError | null {
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));

  // Check all connection endpoints reference real nodes
  for (const conn of workflow.connections) {
    if (!nodeIds.has(conn.from)) {
      return { message: `Connection references unknown node: ${conn.from}` };
    }
    if (!nodeIds.has(conn.to)) {
      return { message: `Connection references unknown node: ${conn.to}` };
    }
  }

  // Check exactly one trigger node
  const triggerTypes: NodeType[] = ["manual", "webhook", "schedule"];
  const triggers = workflow.nodes.filter((n) => triggerTypes.includes(n.type));
  if (triggers.length === 0) {
    return { message: "Workflow must have exactly one trigger node" };
  }
  if (triggers.length > 1) {
    return { message: "Workflow must have exactly one trigger node" };
  }

  // Cycle detection (DFS)
  const adj = new Map<string, string[]>();
  for (const node of workflow.nodes) adj.set(node.id, []);
  for (const conn of workflow.connections) {
    adj.get(conn.from)!.push(conn.to);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      if (color.get(next) === GRAY) return true; // cycle
      if (color.get(next) === WHITE && dfs(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const id of nodeIds) {
    if (color.get(id) === WHITE && dfs(id)) {
      return { message: "Workflow graph contains a cycle" };
    }
  }

  return null;
}
