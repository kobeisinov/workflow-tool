import { registerNode } from "../registry";

registerNode({
  type: "manual",
  async run(input) {
    return { outputs: { main: input } };
  },
});
