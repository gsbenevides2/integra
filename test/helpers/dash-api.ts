import { afterEach, beforeEach } from "bun:test";

export interface ApiCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: any;
}

type Reply = unknown | { __status: number; body?: unknown };
type Handler = (call: ApiCall) => Reply | Promise<Reply>;

/** Make a route reply with a non-2xx status (Eden then fills `error`). */
export const fail = (status = 500, body: unknown = { message: "boom" }) => ({
  __status: status,
  body,
});

/** A 200 JSON response whose body is not valid JSON (makes Eden itself reject). */
export const malformed = () => ({ __status: 200, raw: "{not json" });

/**
 * Replace global fetch with a route table keyed `"METHOD /path/:param"`.
 * Handler return value is the JSON body (200) unless it is `fail(...)`.
 * Installs/restores itself around each test; `calls` is reset per test.
 */
export function useApi(routes: Record<string, Handler>) {
  const compiled = Object.entries(routes).map(([key, handler]) => {
    const [method, path] = key.split(" ") as [string, string];
    const re = new RegExp(`^${path.replace(/:[^/]+/g, "[^/]+")}$`);
    return { method, re, handler };
  });
  const calls: ApiCall[] = [];
  const realFetch = globalThis.fetch;

  const fake = async (input: any, init?: any) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = await req.text();
    const call: ApiCall = {
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: text ? JSON.parse(text) : undefined,
    };
    calls.push(call);
    const route = compiled.find(
      (r) => r.method === call.method && r.re.test(call.path),
    );
    if (!route) throw new Error(`Unmocked ${call.method} ${call.path}`);
    const reply: any = await route.handler(call);
    const failed = reply && typeof reply === "object" && "__status" in reply;
    return new Response(
      failed && "raw" in reply
        ? reply.raw
        : JSON.stringify(failed ? (reply.body ?? null) : (reply ?? null)),
      {
        status: failed ? reply.__status : 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = fake as any;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  return calls;
}

/** Minimal recharts stand-in: renders children and exercises formatter/content props. */
export function fakeRecharts(React: typeof import("react")) {
  let lastData: any[] = [];
  const wrap = (name: string) => (props: any) => {
    const probes: any[] = [];
    if (props.data) lastData = props.data;
    const sample = props.data?.[0];
    if (props.tickFormatter) {
      probes.push(props.tickFormatter(sample?.time ?? sample?.collectedAt ?? 1, 0));
      probes.push(props.tickFormatter(0), props.tickFormatter(1), props.tickFormatter(2), props.tickFormatter(3));
    }
    if (props.labelFormatter) probes.push(props.labelFormatter(sample?.collectedAt ?? "2024-01-02T03:04:00Z"));
    if (props.formatter) {
      for (const n of ["Conexão", "Download", "CPU"]) {
        probes.push(props.formatter(12.34, n, { payload: { connectionStatus: "Connected" } }));
      }
    }
    return React.createElement(
      "div",
      { "data-chart": name },
      props.children,
      ...probes.map((p, i) => React.createElement("i", { key: i, "data-probe": name }, JSON.stringify(p))),
      props.content
        ? React.createElement(
            "div",
            { "data-tooltip": true },
            React.cloneElement(props.content, { active: true, payload: [{ payload: lastData[0] }] }),
            React.cloneElement(props.content, { active: false, payload: [] }),
            React.cloneElement(props.content, { active: true, payload: [{}] }),
          )
        : null,
    );
  };
  const names = ["Area", "AreaChart", "CartesianGrid", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis", "Line", "LineChart"];
  return Object.fromEntries(names.map((n) => [n, wrap(n)]));
}
