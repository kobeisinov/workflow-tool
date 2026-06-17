import { describe, it, expect, beforeAll } from "vitest";
import { executeWorkflow } from "../executor";
import { Workflow } from "@workflow-tool/shared";

const ctx = {
  executionId: "test-exec",
  workflowId: "test-wf",
  log: () => {},
};

beforeAll(async () => {
  // Importing executor already registers all nodes
});

describe("executor", () => {
  it("runs a linear chain: manual → set", async () => {
    const workflow: Workflow = {
      name: "Test",
      nodes: [
        { id: "t1", type: "manual", params: {}, position: { x: 0, y: 0 } },
        { id: "s1", type: "set", params: { result: "done" }, position: { x: 1, y: 0 } },
      ],
      connections: [{ from: "t1", fromPort: "main", to: "s1" }],
    };

    const result = await executeWorkflow(workflow, { input: "hello" }, ctx);
    expect(result.status).toBe("success");
    expect(result.nodeRuns).toHaveLength(2);
    const setRun = result.nodeRuns.find((r) => r.nodeId === "s1")!;
    expect(setRun.status).toBe("success");
    expect((setRun.output as { main: { result: string } }).main.result).toBe("done");
  });

  it("routes true branch of if node", async () => {
    const workflow: Workflow = {
      name: "If test",
      nodes: [
        { id: "t1", type: "manual", params: {}, position: { x: 0, y: 0 } },
        {
          id: "if1",
          type: "if",
          params: { field: "status", operator: "equals", value: "ok" },
          position: { x: 1, y: 0 },
        },
        { id: "s_true", type: "set", params: { branch: "true" }, position: { x: 2, y: 0 } },
        { id: "s_false", type: "set", params: { branch: "false" }, position: { x: 2, y: 1 } },
      ],
      connections: [
        { from: "t1", fromPort: "main", to: "if1" },
        { from: "if1", fromPort: "true", to: "s_true" },
        { from: "if1", fromPort: "false", to: "s_false" },
      ],
    };

    const result = await executeWorkflow(workflow, { status: "ok" }, ctx);
    expect(result.status).toBe("success");
    const trueRun = result.nodeRuns.find((r) => r.nodeId === "s_true")!;
    const falseRun = result.nodeRuns.find((r) => r.nodeId === "s_false")!;
    expect(trueRun.status).toBe("success");
    expect(falseRun.status).toBe("skipped");
  });

  it("routes false branch of if node", async () => {
    const workflow: Workflow = {
      name: "If false test",
      nodes: [
        { id: "t1", type: "manual", params: {}, position: { x: 0, y: 0 } },
        {
          id: "if1",
          type: "if",
          params: { field: "status", operator: "equals", value: "ok" },
          position: { x: 1, y: 0 },
        },
        { id: "s_true", type: "set", params: { branch: "true" }, position: { x: 2, y: 0 } },
        { id: "s_false", type: "set", params: { branch: "false" }, position: { x: 2, y: 1 } },
      ],
      connections: [
        { from: "t1", fromPort: "main", to: "if1" },
        { from: "if1", fromPort: "true", to: "s_true" },
        { from: "if1", fromPort: "false", to: "s_false" },
      ],
    };

    const result = await executeWorkflow(workflow, { status: "fail" }, ctx);
    expect(result.status).toBe("success");
    const trueRun = result.nodeRuns.find((r) => r.nodeId === "s_true")!;
    const falseRun = result.nodeRuns.find((r) => r.nodeId === "s_false")!;
    expect(trueRun.status).toBe("skipped");
    expect(falseRun.status).toBe("success");
  });

  it("rejects a workflow with a cycle", async () => {
    const workflow: Workflow = {
      name: "Cycle test",
      nodes: [
        { id: "t1", type: "manual", params: {}, position: { x: 0, y: 0 } },
        { id: "a", type: "set", params: {}, position: { x: 1, y: 0 } },
        { id: "b", type: "set", params: {}, position: { x: 2, y: 0 } },
      ],
      connections: [
        { from: "t1", fromPort: "main", to: "a" },
        { from: "a", fromPort: "main", to: "b" },
        { from: "b", fromPort: "main", to: "a" }, // cycle
      ],
    };

    const result = await executeWorkflow(workflow, {}, ctx);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/cycle/i);
  });

  it("rejects a workflow with no trigger", async () => {
    const workflow: Workflow = {
      name: "No trigger",
      nodes: [
        { id: "a", type: "set", params: {}, position: { x: 0, y: 0 } },
      ],
      connections: [],
    };

    const result = await executeWorkflow(workflow, {}, ctx);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/trigger/i);
  });
});
