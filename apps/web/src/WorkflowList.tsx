import React, { useEffect, useState } from "react";
import { api, Workflow } from "./lib/api";

interface Props {
  onOpen: (id: string) => void;
}

export default function WorkflowList({ onOpen }: Props) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.listWorkflows()
      .then(setWorkflows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const name = prompt("Workflow name:");
    if (!name) return;
    try {
      const res = await api.createWorkflow({
        name,
        nodes: [{ id: "trigger-1", type: "manual", params: {}, position: { x: 100, y: 200 } }],
        connections: [],
      });
      onOpen(res.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create");
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this workflow?")) return;
    try {
      await api.deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Workflows</h2>
        <button
          onClick={handleCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + New Workflow
        </button>
      </div>

      {loading && <p className="text-slate-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && workflows.length === 0 && (
        <p className="text-slate-400 text-center py-16">No workflows yet. Create one to get started.</p>
      )}

      <div className="space-y-3">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            onClick={() => onOpen(wf.id)}
            className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-blue-400 hover:shadow-sm transition"
          >
            <div>
              <h3 className="font-semibold text-slate-800">{wf.name}</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Updated {new Date(wf.updated_at).toLocaleString()}
                {wf.webhook_path && (
                  <span className="ml-3 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                    webhook: /webhook/{wf.webhook_path}
                  </span>
                )}
                {wf.cron && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                    cron: {wf.cron}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  wf.active
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {wf.active ? "Active" : "Inactive"}
              </span>
              <button
                onClick={(e) => handleDelete(wf.id, e)}
                className="text-slate-400 hover:text-red-500 text-sm px-2"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
