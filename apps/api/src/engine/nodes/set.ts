import { registerNode } from "../registry";

registerNode({
  type: "set",
  async run(input, params) {
    const output = { ...(typeof input === "object" && input !== null ? input : {}), ...params };
    return { outputs: { main: output } };
  },
});
