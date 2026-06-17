import { Workflow, WorkflowNode, validateGraph } from "@workflow-tool/shared";
import { NodeContext, NodeRunner, getNode } from "./registry";

// Register all node types
import "./nodes/manual";
import "./nodes/webhook";
import "./nodes/schedule";
import "./nodes/httpRequest";
import "./nodes/if";
import "./nodes/set";

export interface NodeRunRecord {
  nodeId: string;
  nodeType: string;
  status: "success" | "error" | "skipped";
  input: unknown;
  output: unknown;
  error?: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface ExecutionResult {
  status: "success" | "error";
  error?: string;
  nodeRuns: NodeRunRecord[];
}

export async function executeWorkflow(
  workflow: Workflow,
  triggerPayload: unknown,
  ctx: NodeContext
): Promise<ExecutionResult> {
  const validationError = validateGraph(workflow);
  if (validationError) {
    return {
      status: "error",
      error: validationError.message,
      nodeRuns: [],
    };
  }

  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of workflow.nodes) nodeMap.set(node.id, node);

  // Build adjacency: from node -> [{to, fromPort}]
  const adj = new Map<string, Array<{ to: string; fromPort: string }>>();
  // Build reverse: to node -> [from node ids]
  const parents = new Map<string, Set<string>>();

  for (const node of workflow.nodes) {
    adj.set(node.id, []);
    parents.set(node.id, new Set());
  }

  for (const conn of workflow.connections) {
    adj.get(conn.from)!.push({ to: conn.to, fromPort: conn.fromPort ?? "main" });
    parents.get(conn.to)!.add(conn.from);
  }

  // Find trigger node
  const triggerTypes = new Set(["manual", "webhook", "schedule"]);
  const triggerNode = workflow.nodes.find((n) => triggerTypes.has(n.type))!;

  // Track delivered inputs and which parents have fired for each node
  const deliveredInputs = new Map<string, unknown[]>(); // nodeId -> list of inputs
  const firedParents = new Map<string, Set<string>>(); // nodeId -> set of parent ids that fired
  const skipped = new Set<string>();
  const nodeRuns: NodeRunRecord[] = [];

  for (const node of workflow.nodes) {
    deliveredInputs.set(node.id, []);
    firedParents.set(node.id, new Set());
  }

  // Deliver trigger payload to trigger node
  deliveredInputs.get(triggerNode.id)!.push(triggerPayload);

  const ready: string[] = [triggerNode.id];

  // Topological BFS
  while (ready.length > 0) {
    const nodeId = ready.shift()!;
    const node = nodeMap.get(nodeId)!;

    if (skipped.has(nodeId)) {
      // Mark all downstream as skipped too
      propagateSkip(nodeId, adj, skipped);
      continue;
    }

    const inputs = deliveredInputs.get(nodeId) ?? [];
    const mergedInput = inputs.length === 1 ? inputs[0] : inputs;

    const startedAt = new Date();
    let runner: NodeRunner;
    try {
      runner = getNode(node.type);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      nodeRuns.push({
        nodeId,
        nodeType: node.type,
        status: "error",
        input: mergedInput,
        output: null,
        error: err,
        startedAt,
        finishedAt: new Date(),
      });
      return { status: "error", error: err, nodeRuns };
    }

    let result: Awaited<ReturnType<NodeRunner["run"]>>;
    try {
      result = await runner.run(mergedInput, node.params, ctx);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      nodeRuns.push({
        nodeId,
        nodeType: node.type,
        status: "error",
        input: mergedInput,
        output: null,
        error: err,
        startedAt,
        finishedAt: new Date(),
      });
      return { status: "error", error: err, nodeRuns };
    }

    nodeRuns.push({
      nodeId,
      nodeType: node.type,
      status: "success",
      input: mergedInput,
      output: result.outputs,
      startedAt,
      finishedAt: new Date(),
    });

    // Deliver outputs to children
    const children = adj.get(nodeId) ?? [];
    const firedPorts = new Set(Object.keys(result.outputs));

    for (const { to, fromPort } of children) {
      if (firedPorts.has(fromPort)) {
        deliveredInputs.get(to)!.push(result.outputs[fromPort]);
        firedParents.get(to)!.add(nodeId);

        // v1: push ready as soon as first active parent fires
        if (!ready.includes(to) && !skipped.has(to)) {
          ready.push(to);
        }
      } else {
        // This port didn't fire — if all parents of `to` come from this node's
        // non-fired ports, mark as skipped
        skipped.add(to);
        propagateSkip(to, adj, skipped);
      }
    }

    // Ports that didn't fire — skip exclusively-downstream nodes
    const allChildPorts = new Set(children.map((c) => c.fromPort));
    for (const port of allChildPorts) {
      if (!firedPorts.has(port)) {
        for (const { to, fromPort } of children) {
          if (fromPort === port) {
            skipped.add(to);
            propagateSkip(to, adj, skipped);
          }
        }
      }
    }
  }

  // Record skipped nodes
  for (const nodeId of skipped) {
    const node = nodeMap.get(nodeId)!;
    nodeRuns.push({
      nodeId,
      nodeType: node.type,
      status: "skipped",
      input: null,
      output: null,
      startedAt: new Date(),
      finishedAt: new Date(),
    });
  }

  return { status: "success", nodeRuns };
}

function propagateSkip(
  nodeId: string,
  adj: Map<string, Array<{ to: string; fromPort: string }>>,
  skipped: Set<string>
) {
  const children = adj.get(nodeId) ?? [];
  for (const { to } of children) {
    if (!skipped.has(to)) {
      skipped.add(to);
      propagateSkip(to, adj, skipped);
    }
  }
}
