const BASE = "/api";

function getToken() {
  return localStorage.getItem("token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: { id: string; email: string } }>("/auth/me"),

  listWorkflows: () => request<Workflow[]>("/workflows"),
  getWorkflow: (id: string) => request<WorkflowFull>(`/workflows/${id}`),
  createWorkflow: (data: unknown) =>
    request<{ id: string }>("/workflows", { method: "POST", body: JSON.stringify(data) }),
  updateWorkflow: (id: string, data: unknown) =>
    request<WorkflowFull>(`/workflows/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWorkflow: (id: string) =>
    request<void>(`/workflows/${id}`, { method: "DELETE" }),

  activateWorkflow: (id: string) =>
    request<{ activated: boolean; webhookPath: string | null; cron: string | null }>(
      `/workflows/${id}/activate`,
      { method: "POST" }
    ),
  deactivateWorkflow: (id: string) =>
    request<{ deactivated: boolean }>(`/workflows/${id}/deactivate`, { method: "POST" }),

  runWorkflow: (id: string, payload?: unknown) =>
    request<{ executionId: string }>(`/workflows/${id}/run`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),

  listExecutions: (workflowId: string) =>
    request<Execution[]>(`/workflows/${workflowId}/executions`),

  getExecution: (id: string) => request<ExecutionDetail>(`/executions/${id}`),
};

export interface Workflow {
  id: string;
  name: string;
  active: boolean;
  webhook_path: string | null;
  cron: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowFull extends Workflow {
  graph: {
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
  };
}

export interface Execution {
  id: string;
  workflow_id: string;
  status: string;
  mode: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface NodeRun {
  id: string;
  node_id: string;
  node_type: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string;
  finished_at: string;
}

export interface ExecutionDetail extends Execution {
  nodeRuns: NodeRun[];
}
