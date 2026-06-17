import { NodeType } from "@workflow-tool/shared";

export interface NodeContext {
  executionId: string;
  workflowId: string;
  log: (msg: string) => void;
}

export interface NodeResult {
  outputs: Record<string, unknown>;
}

export interface NodeRunner {
  type: NodeType;
  run(
    input: unknown,
    params: Record<string, unknown>,
    ctx: NodeContext
  ): Promise<NodeResult>;
}

const runners = new Map<NodeType, NodeRunner>();

export function registerNode(runner: NodeRunner) {
  runners.set(runner.type, runner);
}

export function getNode(type: NodeType): NodeRunner {
  const runner = runners.get(type);
  if (!runner) throw new Error(`Unknown node type: ${type}`);
  return runner;
}
