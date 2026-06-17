import React, { useState } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./Login";
import WorkflowList from "./WorkflowList";
import Canvas from "./Canvas";
import Executions from "./Executions";

type View =
  | { name: "list" }
  | { name: "canvas"; workflowId: string }
  | { name: "executions"; workflowId: string };

function Main() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState<View>({ name: "list" });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-slate-500">Loading...</span>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
        <button
          onClick={() => setView({ name: "list" })}
          className="text-lg font-bold text-slate-800 hover:text-blue-600"
        >
          Workflow Tool
        </button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">{user.email}</span>
          <button
            onClick={logout}
            className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded px-3 py-1"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {view.name === "list" && (
          <WorkflowList
            onOpen={(id) => setView({ name: "canvas", workflowId: id })}
          />
        )}
        {view.name === "canvas" && (
          <Canvas
            workflowId={view.workflowId}
            onBack={() => setView({ name: "list" })}
            onViewExecutions={(id) => setView({ name: "executions", workflowId: id })}
          />
        )}
        {view.name === "executions" && (
          <Executions
            workflowId={view.workflowId}
            onBack={() => setView({ name: "canvas", workflowId: view.workflowId })}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}
