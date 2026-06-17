import { Node, Edge } from "@xyflow/react";

export interface WorkflowGraph {
  name: string;
  nodes: Array<{
    id: string;
    type: string;
    params: Record<string, unknown>;
    position: { x: number; y: number };
  }>;
  connections: Array<{
    from: string;
    fromPort: string;
    to: string;
  }>;
}

export function graphToFlow(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "workflowNode",
    position: n.position,
    data: { nodeType: n.type, params: n.params, label: n.type },
  }));

  const edges: Edge[] = graph.connections.map((c, i) => ({
    id: `e-${i}-${c.from}-${c.to}`,
    source: c.from,
    sourceHandle: c.fromPort ?? "main",
    target: c.to,
    targetHandle: "input",
    animated: true,
  }));

  return { nodes, edges };
}

export function flowToGraph(
  name: string,
  nodes: Node[],
  edges: Edge[]
): WorkflowGraph {
  return {
    name,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.data as { nodeType: string }).nodeType,
      params: (n.data as { params: Record<string, unknown> }).params ?? {},
      position: n.position,
    })),
    connections: edges.map((e) => ({
      from: e.source,
      fromPort: e.sourceHandle ?? "main",
      to: e.target,
    })),
  };
}
