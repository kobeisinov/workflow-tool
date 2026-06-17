import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
  NodeProps,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api, WorkflowFull } from "./lib/api";
import { graphToFlow, flowToGraph } from "./lib/transform";
import ParamPanel from "./ParamPanel";

const NODE_TYPES_LIST = ["manual", "webhook", "schedule", "httpRequest", "if", "set"] as const;
type NodeKind = typeof NODE_TYPES_LIST[number];

const NODE_COLORS: Record<NodeKind, string> = {
  manual: "#3b82f6",
  webhook: "#8b5cf6",
  schedule: "#f59e0b",
  httpRequest: "#10b981",
  if: "#f97316",
  set: "#6366f1",
};

const NODE_LABELS: Record<NodeKind, string> = {
  manual: "Manual Trigger",
  webhook: "Webhook",
  schedule: "Schedule",
  httpRequest: "HTTP Request",
  if: "If / Branch",
  set: "Set",
};

interface WorkflowNodeData {
  nodeType: NodeKind;
  params: Record<string, unknown>;
  label: string;
  selected?: boolean;
}

function WorkflowNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  const color = NODE_COLORS[d.nodeType] ?? "#94a3b8";
  const isTrigger = ["manual", "webhook", "schedule"].includes(d.nodeType);

  return (
    <div
      className={`rounded-lg shadow-md border-2 transition-all ${
        selected ? "border-blue-500" : "border-transparent"
      }`}
      style={{ minWidth: 160, background: "#fff" }}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          style={{ background: "#94a3b8" }}
        />
      )}

      <div
        className="rounded-t-lg px-3 py-1.5 text-white text-xs font-semibold"
        style={{ background: color }}
      >
        {NODE_LABELS[d.nodeType] ?? d.nodeType}
      </div>
      <div className="px-3 py-2 text-xs text-slate-500">
        {Object.keys(d.params).length > 0
          ? Object.entries(d.params)
              .slice(0, 2)
              .map(([k, v]) => (
                <div key={k} className="truncate max-w-[140px]">
                  <span className="font-medium">{k}:</span> {String(v)}
                </div>
              ))
          : <span className="italic">No params</span>}
      </div>

      {/* Output handles */}
      {d.nodeType === "if" ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: "35%", background: "#22c55e" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: "65%", background: "#ef4444" }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="main"
          style={{ background: "#94a3b8" }}
        />
      )}
    </div>
  );
}

const NODE_TYPES = { workflowNode: WorkflowNodeComponent };

interface Props {
  workflowId: string;
  onBack: () => void;
  onViewExecutions: (id: string) => void;
}

function CanvasInner({ workflowId, onBack, onViewExecutions }: Props) {
  const [workflow, setWorkflow] = useState<WorkflowFull | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [name, setName] = useState("");
  const reactFlow = useReactFlow();
  const idCounter = useRef(100);

  useEffect(() => {
    api.getWorkflow(workflowId).then((wf) => {
      setWorkflow(wf);
      setName(wf.name);
      const { nodes: n, edges: e } = graphToFlow(wf.graph);
      setNodes(n);
      setEdges(e);
    });
  }, [workflowId]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: true }, eds)
      ),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const updateNodeParams = (nodeId: string, params: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, params } }
          : n
      )
    );
  };

  const addNode = (type: NodeKind) => {
    const id = `node-${idCounter.current++}`;
    const viewport = reactFlow.getViewport();
    const newNode: Node = {
      id,
      type: "workflowNode",
      position: {
        x: (-viewport.x + 300) / viewport.zoom,
        y: (-viewport.y + 200) / viewport.zoom,
      },
      data: { nodeType: type, params: {}, label: type },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleSave = async () => {
    if (!workflow) return;
    setSaving(true);
    setStatus("");
    try {
      const graph = flowToGraph(name, nodes, edges);
      await api.updateWorkflow(workflowId, graph);
      setStatus("Saved!");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!workflow) return;
    try {
      if (workflow.active) {
        await api.deactivateWorkflow(workflowId);
        setWorkflow({ ...workflow, active: false });
        setStatus("Deactivated");
      } else {
        // Save first
        const graph = flowToGraph(name, nodes, edges);
        await api.updateWorkflow(workflowId, graph);
        const res = await api.activateWorkflow(workflowId);
        setWorkflow({
          ...workflow,
          active: true,
          webhook_path: res.webhookPath,
          cron: res.cron,
        });
        setStatus(
          res.webhookPath
            ? `Activated! Webhook: POST /webhook/${res.webhookPath}`
            : "Activated!"
        );
      }
      setTimeout(() => setStatus(""), 5000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setStatus("");
    try {
      const res = await api.runWorkflow(workflowId);
      setStatus(`Run started: ${res.executionId}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 shrink-0 flex-wrap">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 text-sm">
          ← Back
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm font-medium w-48"
        />

        <div className="h-5 w-px bg-slate-200" />

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-slate-700 text-white text-sm px-3 py-1 rounded hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        <button
          onClick={handleToggleActive}
          className={`text-sm px-3 py-1 rounded font-medium ${
            workflow?.active
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {workflow?.active ? "Active" : "Activate"}
        </button>

        <button
          onClick={handleRun}
          disabled={running}
          className="bg-blue-600 text-white text-sm px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Running..." : "Run"}
        </button>

        <button
          onClick={() => onViewExecutions(workflowId)}
          className="text-sm text-slate-600 hover:text-slate-900 underline"
        >
          Executions
        </button>

        {status && (
          <span className="text-sm text-blue-600 ml-2">{status}</span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette */}
        <div className="w-44 bg-white border-r border-slate-200 p-3 shrink-0 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Add Node</p>
          <div className="space-y-1">
            {NODE_TYPES_LIST.map((type) => (
              <button
                key={type}
                onClick={() => addNode(type)}
                className="w-full text-left text-xs px-2 py-2 rounded hover:bg-slate-100 flex items-center gap-2"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: NODE_COLORS[type] }}
                />
                {NODE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            fitView
            deleteKeyCode="Delete"
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* Param Panel */}
        {selectedNode && (
          <ParamPanel
            node={selectedNode}
            onUpdate={(params) => updateNodeParams(selectedNode.id, params)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
