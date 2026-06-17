import { registerNode } from "../registry";

registerNode({
  type: "webhook",
  async run(input) {
    return { outputs: { main: input } };
  },
});
