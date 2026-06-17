import React, { useEffect, useState, useCallback } from "react";
import { api, Execution, ExecutionDetail, NodeRun } from "./lib/api";

interface Props {
  workflowId: string;
  onBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-700",
  running: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  skipped: "bg-slate-100 text-slate-500",
};

export default function Executions({ workflowId, onBack }: Props) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selected, setSelected] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(() => {
    api.listExecutions(workflowId).then(setExecutions).catch(console.error);
  }, [workflowId]);

  useEffect(() => {
    setLoading(true);
    loadList();
    setLoading(false);

    // Auto-refresh while any execution is running/queued
    const interval = setInterval(() => {
      loadList();
    }, 2000);
    return () => clearInterval(interval);
  }, [loadList]);

  const selectExecution = async (exec: Execution) => {
    const detail = await api.getExecution(exec.id);
    setSelected(detail);

    // If running, keep refreshing
    if (exec.status === "running" || exec.status === "queued") {
      const interval = setInterval(async () => {
        const updated = await api.getExecution(exec.id);
        setSelected(updated);
        if (updated.status !== "running" && updated.status !== "queued") {
          clearInterval(interval);
        }
      }, 1000);
    }
  };

  return (
    <div className="h-full flex">
      {/* List */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 text-sm">
            ← Canvas
          </button>
          <h2 className="font-semibold text-slate-800">Execution History</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-slate-500 text-sm">Loading...</p>}
          {!loading && executions.length === 0 && (
            <p className="p-4 text-slate-400 text-sm">No executions yet.</p>
          )}
          {executions.map((exec) => (
            <button
              key={exec.id}
              onClick={() => selectExecution(exec)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition ${
                selected?.id === exec.id ? "bg-blue-50" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    STATUS_COLORS[exec.status] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {exec.status}
                </span>
                <span className="text-xs text-slate-400 capitalize">{exec.mode}</span>
              </div>
              <p className="text-xs text-slate-500">
                {new Date(exec.started_at).toLocaleString()}
              </p>
              {exec.error && (
                <p className="text-xs text-red-500 truncate mt-0.5">{exec.error}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected && (
          <p className="text-slate-400 text-center mt-20">Select an execution to inspect it.</p>
        )}

        {selected && (
          <div>
            <div className="flex items-center gap-4 mb-6">
              <h3 className="text-lg font-bold text-slate-800">Execution Detail</h3>
              <span
                className={`text-sm px-2 py-0.5 rounded-full font-medium ${
                  STATUS_COLORS[selected.status] ?? ""
                }`}
              >
                {selected.status}
              </span>
            </div>

            <div className="text-sm text-slate-600 mb-6 space-y-1">
              <p><span className="font-medium">ID:</span> {selected.id}</p>
              <p><span className="font-medium">Mode:</span> {selected.mode}</p>
              <p><span className="font-medium">Started:</span> {new Date(selected.started_at).toLocaleString()}</p>
              {selected.finished_at && (
                <p><span className="font-medium">Finished:</span> {new Date(selected.finished_at).toLocaleString()}</p>
              )}
              {selected.error && (
                <p className="text-red-600"><span className="font-medium">Error:</span> {selected.error}</p>
              )}
            </div>

            <h4 className="font-semibold text-slate-700 mb-3">Node Runs</h4>
            <div className="space-y-3">
              {selected.nodeRuns.map((nr) => (
                <NodeRunCard key={nr.id} nodeRun={nr} />
              ))}
              {selected.nodeRuns.length === 0 && selected.status !== "queued" && (
                <p className="text-slate-400 text-sm">No node runs recorded.</p>
              )}
              {selected.status === "queued" || selected.status === "running" ? (
                <p className="text-blue-600 text-sm animate-pulse">Running...</p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeRunCard({ nodeRun }: { nodeRun: NodeRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              STATUS_COLORS[nodeRun.status] ?? "bg-slate-100"
            }`}
          >
            {nodeRun.status}
          </span>
          <span className="text-sm font-medium text-slate-800">{nodeRun.node_id}</span>
          <span className="text-xs text-slate-400">{nodeRun.node_type}</span>
        </div>
        <span className="text-slate-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="p-4 space-y-3 text-xs">
          {nodeRun.error && (
            <div>
              <p className="font-semibold text-red-600 mb-1">Error</p>
              <pre className="bg-red-50 text-red-700 p-2 rounded overflow-auto">{nodeRun.error}</pre>
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-600 mb-1">Input</p>
            <pre className="bg-slate-50 p-2 rounded overflow-auto text-slate-700 max-h-48">
              {JSON.stringify(nodeRun.input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="font-semibold text-slate-600 mb-1">Output</p>
            <pre className="bg-slate-50 p-2 rounded overflow-auto text-slate-700 max-h-48">
              {JSON.stringify(nodeRun.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
