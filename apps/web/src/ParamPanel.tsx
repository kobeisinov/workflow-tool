import React, { useState, useEffect } from "react";
import { Node } from "@xyflow/react";

interface NodeData {
  nodeType: string;
  params: Record<string, unknown>;
}

interface Props {
  node: Node;
  onUpdate: (params: Record<string, unknown>) => void;
  onClose: () => void;
}

const NODE_PARAM_SCHEMAS: Record<string, Array<{ key: string; label: string; placeholder?: string }>> = {
  webhook: [{ key: "path", label: "Webhook Path", placeholder: "e.g. my-webhook" }],
  schedule: [{ key: "cron", label: "Cron Expression", placeholder: "e.g. 0 * * * *" }],
  httpRequest: [
    { key: "url", label: "URL", placeholder: "https://..." },
    { key: "method", label: "Method", placeholder: "GET, POST, PUT, DELETE" },
    { key: "body", label: "Body (JSON or {{trigger.body}})", placeholder: '{"key":"value"}' },
  ],
  if: [
    { key: "field", label: "Field Path", placeholder: "e.g. status or body.status" },
    { key: "operator", label: "Operator", placeholder: "equals, notEquals, contains, exists" },
    { key: "value", label: "Value", placeholder: "e.g. ok" },
  ],
  set: [
    { key: "key1", label: "Key 1", placeholder: "key" },
    { key: "value1", label: "Value 1", placeholder: "value" },
    { key: "key2", label: "Key 2", placeholder: "key" },
    { key: "value2", label: "Value 2", placeholder: "value" },
  ],
  manual: [],
};

export default function ParamPanel({ node, onUpdate, onClose }: Props) {
  const data = node.data as unknown as NodeData;
  const schema = NODE_PARAM_SCHEMAS[data.nodeType] ?? [];

  // For "set" nodes, params are freeform key-value pairs.
  // For others, each schema field maps to a key in params.
  const [localParams, setLocalParams] = useState<Record<string, string>>({});

  useEffect(() => {
    const p: Record<string, string> = {};
    if (data.nodeType === "set") {
      const entries = Object.entries(data.params);
      entries.forEach(([k, v], i) => {
        p[`key${i + 1}`] = k;
        p[`value${i + 1}`] = String(v);
      });
    } else {
      for (const field of schema) {
        p[field.key] = String(data.params[field.key] ?? "");
      }
    }
    setLocalParams(p);
  }, [node.id]);

  const handleChange = (key: string, value: string) => {
    setLocalParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    let params: Record<string, unknown>;
    if (data.nodeType === "set") {
      params = {};
      for (let i = 1; i <= 4; i++) {
        const k = localParams[`key${i}`];
        const v = localParams[`value${i}`];
        if (k?.trim()) params[k.trim()] = v ?? "";
      }
    } else {
      params = {};
      for (const field of schema) {
        if (localParams[field.key] !== undefined && localParams[field.key] !== "") {
          params[field.key] = localParams[field.key];
        }
      }
    }
    onUpdate(params);
  };

  return (
    <div className="w-72 bg-white border-l border-slate-200 p-4 overflow-y-auto shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800 capitalize">{data.nodeType}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">
          ×
        </button>
      </div>

      <p className="text-xs text-slate-400 mb-3">Node ID: {node.id}</p>

      {schema.length === 0 && (
        <p className="text-sm text-slate-500 italic">No parameters for this node type.</p>
      )}

      <div className="space-y-3">
        {schema.map((field) => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {field.label}
            </label>
            <input
              value={localParams[field.key] ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        ))}
      </div>

      {schema.length > 0 && (
        <button
          onClick={handleApply}
          className="mt-4 w-full bg-blue-600 text-white rounded py-1.5 text-sm font-medium hover:bg-blue-700"
        >
          Apply
        </button>
      )}
    </div>
  );
}
