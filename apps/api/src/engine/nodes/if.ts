import { registerNode } from "../registry";

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

registerNode({
  type: "if",
  async run(input, params) {
    const field = params.field as string;
    const operator = (params.operator as string) ?? "equals";
    const expected = params.value;

    const actual = getNestedValue(input, field);

    let result: boolean;
    switch (operator) {
      case "equals":
        result = actual == expected;
        break;
      case "notEquals":
        result = actual != expected;
        break;
      case "contains":
        result = typeof actual === "string" && actual.includes(String(expected));
        break;
      case "greaterThan":
        result = Number(actual) > Number(expected);
        break;
      case "lessThan":
        result = Number(actual) < Number(expected);
        break;
      case "exists":
        result = actual !== undefined && actual !== null;
        break;
      default:
        result = false;
    }

    if (result) {
      return { outputs: { true: input } };
    } else {
      return { outputs: { false: input } };
    }
  },
});
