import { registerNode } from "../registry";

registerNode({
  type: "schedule",
  async run(input) {
    return { outputs: { main: input } };
  },
});
