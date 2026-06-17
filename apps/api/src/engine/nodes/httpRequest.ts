import { registerNode } from "../registry";

registerNode({
  type: "httpRequest",
  async run(input, params) {
    const method = (params.method as string) ?? "GET";
    const url = params.url as string;
    if (!url) throw new Error("httpRequest node requires a url param");

    const options: RequestInit = { method };

    if (params.headers && typeof params.headers === "object") {
      options.headers = params.headers as Record<string, string>;
    }

    if (params.body && method !== "GET" && method !== "HEAD") {
      const body = params.body as string;
      // Allow simple template: {{trigger.body}} or a JSON string
      let resolvedBody = body;
      if (body === "{{trigger.body}}" && input != null) {
        resolvedBody = JSON.stringify(input);
        options.headers = {
          "Content-Type": "application/json",
          ...(options.headers as Record<string, string>),
        };
      }
      options.body = resolvedBody;
    }

    const res = await fetch(url, options);
    let data: unknown;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return {
      outputs: {
        main: { status: res.status, headers: Object.fromEntries(res.headers), body: data },
      },
    };
  },
});
