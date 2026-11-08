import { fetchFromAtlassianStatuspage } from "@server/modules/status-platform/service/fetchers/atlassian";
import { fetchFromCloudflareStatus } from "@server/modules/status-platform/service/fetchers/cloudflare";
import { fetchFromGenericHttp } from "@server/modules/status-platform/service/fetchers/generic";
import { fetchFromIncidentIoStatus } from "@server/modules/status-platform/service/fetchers/incident";
import { Fetchers } from "@server/modules/status-platform/service/fetchers/index";
import { fetchFromInstatusStatuspage } from "@server/modules/status-platform/service/fetchers/instatus";
import { fetchFromShopifyStatus } from "@server/modules/status-platform/service/fetchers/shopify";
import { fetchFromWakeStatuspage } from "@server/modules/status-platform/service/fetchers/wake";

import { afterEach, describe, expect, spyOn, test } from "bun:test";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init);

let spy: ReturnType<typeof spyOn> | undefined;
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  spy = spyOn(globalThis, "fetch").mockImplementation(((u: unknown, i?: RequestInit) =>
    Promise.resolve(handler(String(u), i))) as never);
  return spy;
}
afterEach(() => spy?.mockRestore());

test("index maps every platform to a fetcher", () => {
  expect(Object.keys(Fetchers).sort()).toEqual(
    ["atlassian", "cloudflare", "generic", "incident", "instatus", "shopify", "wake"],
  );
});

describe("atlassian", () => {
  test("OK when indicator none", async () => {
    const f = mockFetch(() => json({ status: { indicator: "none" } }));
    expect(await fetchFromAtlassianStatuspage("https://a.io/x")).toEqual({ status: "OK" });
    expect(f.mock.calls[0]![0]).toBe("https://a.io/api/v2/status.json");
  });
  test("DOWN with incident body", async () => {
    mockFetch((u) =>
      u.includes("status.json")
        ? json({ status: { indicator: "major" } })
        : json({ incidents: [{ incident_updates: [{ body: "boom" }] }] }),
    );
    expect(await fetchFromAtlassianStatuspage("https://a.io")).toEqual({
      status: "DOWN",
      problemDescription: "boom",
    });
  });
  test("DOWN with unknown incident", async () => {
    mockFetch((u) =>
      u.includes("status.json") ? json({ status: { indicator: "minor" } }) : json({ incidents: [] }),
    );
    expect((await fetchFromAtlassianStatuspage("https://a.io")) as { problemDescription: string }).toMatchObject({
      problemDescription: "Incidente desconhecido",
    });
  });
});

describe("incident.io", () => {
  test("OK", async () => {
    mockFetch(() => json({ summary: { affected_components: [] } }));
    expect(await fetchFromIncidentIoStatus("https://i.io")).toEqual({ status: "OK" });
  });
  test("DOWN with message", async () => {
    mockFetch((u) =>
      u.endsWith("/incidents")
        ? json({ incidents: [{ name: "n", updates: [{ message_string: "msg" }] }] })
        : json({ summary: { affected_components: [1] } }),
    );
    expect(await fetchFromIncidentIoStatus("https://i.io")).toEqual({
      status: "DOWN",
      problemDescription: "msg",
    });
  });
  test("DOWN unknown", async () => {
    mockFetch((u) =>
      u.endsWith("/incidents") ? json({ incidents: [] }) : json({ summary: { affected_components: [1] } }),
    );
    expect(await fetchFromIncidentIoStatus("https://i.io")).toEqual({
      status: "DOWN",
      problemDescription: "Incidente desconhecido",
    });
  });
});

describe("instatus", () => {
  test("DOWN with incident name", async () => {
    mockFetch(() =>
      json({ page: { status: "HASISSUES" }, activeIncidents: [{ name: "inc", status: "INVESTIGATING" }] }),
    );
    expect(await fetchFromInstatusStatuspage("https://s.io")).toEqual({
      status: "DOWN",
      problemDescription: "inc",
    });
  });
  test("OK when up or no incidents", async () => {
    mockFetch(() => json({ page: { status: "HASISSUES" }, activeIncidents: [] }));
    expect(await fetchFromInstatusStatuspage("https://s.io")).toEqual({ status: "OK" });
    mockFetch(() => json({ page: { status: "UP" } }));
    expect(await fetchFromInstatusStatuspage("https://s.io")).toEqual({ status: "OK" });
  });
  test("unknown incident name fallback", async () => {
    mockFetch(() =>
      json({ page: { status: "HASISSUES" }, activeIncidents: [{ status: "RESOLVED" }] }),
    );
    expect(await fetchFromInstatusStatuspage("https://s.io")).toEqual({
      status: "DOWN",
      problemDescription: "Incidente desconhecido",
    });
  });
});

describe.each([
  ["cloudflare", fetchFromCloudflareStatus, "API da Cloudflare", "Tempo de resposta esgotado"],
  ["shopify", fetchFromShopifyStatus, "API do Shopify", "Tempo de resposta esgotado"],
] as const)("%s", (_n, fetcher, label, timeoutMsg) => {
  test("non-ok", async () => {
    mockFetch(() => new Response("x", { status: 503 }));
    expect(await fetcher("")).toEqual({ status: "DOWN", problemDescription: `${label} retornou 503` });
  });
  test("OK", async () => {
    mockFetch(() => json({ status: { indicator: "none", description: "" } }));
    expect(await fetcher("")).toEqual({ status: "OK" });
  });
  test("description and indicator fallback", async () => {
    mockFetch(() => json({ status: { indicator: "minor", description: "slow" } }));
    expect(await fetcher("")).toEqual({ status: "DOWN", problemDescription: "slow" });
    mockFetch(() => json({ status: { indicator: "major", description: "" } }));
    expect(await fetcher("")).toEqual({ status: "DOWN", problemDescription: "Status: major" });
  });
  test("errors", async () => {
    const t = new Error("t");
    t.name = "TimeoutError";
    spy = spyOn(globalThis, "fetch").mockRejectedValue(t as never);
    expect(await fetcher("")).toEqual({ status: "DOWN", problemDescription: timeoutMsg });
    spy.mockRestore();
    spy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("net") as never);
    expect(await fetcher("")).toEqual({ status: "DOWN", problemDescription: "net" });
    spy.mockRestore();
    spy = spyOn(globalThis, "fetch").mockRejectedValue("str" as never);
    expect(await fetcher("")).toEqual({ status: "DOWN", problemDescription: "Erro desconhecido" });
  });
});

describe("ignoreSsl", () => {
  const tlsOf = (f: ReturnType<typeof mockFetch>, call = 0) =>
    (f.mock.calls[call]![1] as { tls?: unknown } | undefined)?.tls;

  test("generic disables certificate validation only when asked", async () => {
    const f = mockFetch(() => new Response("ok"));
    await fetchFromGenericHttp("https://x.io");
    await fetchFromGenericHttp("https://x.io", { ignoreSsl: true });
    expect(tlsOf(f, 0)).toBeUndefined();
    expect(tlsOf(f, 1)).toEqual({ rejectUnauthorized: false });
  });
  test("atlassian forwards it to every request", async () => {
    const f = mockFetch((u) =>
      u.includes("status.json") ? json({ status: { indicator: "major" } }) : json({ incidents: [] }),
    );
    await fetchFromAtlassianStatuspage("https://a.io", { ignoreSsl: true });
    expect(f.mock.calls).toHaveLength(2);
    expect(tlsOf(f, 0)).toEqual({ rejectUnauthorized: false });
    expect(tlsOf(f, 1)).toEqual({ rejectUnauthorized: false });
  });
  test("incident.io forwards it to every request", async () => {
    const f = mockFetch((u) =>
      u.endsWith("/incidents") ? json({ incidents: [] }) : json({ summary: { affected_components: [1] } }),
    );
    await fetchFromIncidentIoStatus("https://i.io", { ignoreSsl: true });
    expect(f.mock.calls).toHaveLength(2);
    expect(tlsOf(f, 0)).toEqual({ rejectUnauthorized: false });
    expect(tlsOf(f, 1)).toEqual({ rejectUnauthorized: false });
  });
  test("instatus forwards it", async () => {
    const f = mockFetch(() => json({ page: { status: "UP" } }));
    await fetchFromInstatusStatuspage("https://i.io", { ignoreSsl: true });
    expect(tlsOf(f)).toEqual({ rejectUnauthorized: false });
  });
  test("wake forwards it to tenants and summary requests", async () => {
    const f = mockFetch((u) =>
      u.endsWith("/tenants") ? json([{ id: "t1", display_name: "One" }]) : json({ overall_status: "operational" }),
    );
    await fetchFromWakeStatuspage("https://w.io", { ignoreSsl: true });
    expect(f.mock.calls).toHaveLength(2);
    expect(tlsOf(f, 0)).toEqual({ rejectUnauthorized: false });
    expect(tlsOf(f, 1)).toEqual({ rejectUnauthorized: false });
  });
});

describe("generic", () => {
  test("200 OK", async () => {
    mockFetch(() => new Response("ok"));
    expect(await fetchFromGenericHttp("https://x.io")).toEqual({ status: "OK" });
  });
  test("non-200", async () => {
    mockFetch(() => new Response("no", { status: 500 }));
    expect(await fetchFromGenericHttp("https://x.io")).toEqual({
      status: "DOWN",
      problemDescription: "Recebeu HTTP 500 em vez de 200",
    });
  });
  test("errors", async () => {
    const t = new Error("t");
    t.name = "TimeoutError";
    spy = spyOn(globalThis, "fetch").mockRejectedValue(t as never);
    expect(await fetchFromGenericHttp("x")).toEqual({
      status: "DOWN",
      problemDescription: "Tempo de resposta esgotado após 20 segundos",
    });
    spy.mockRestore();
    spy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("net") as never);
    expect(await fetchFromGenericHttp("x")).toEqual({ status: "DOWN", problemDescription: "net" });
    spy.mockRestore();
    spy = spyOn(globalThis, "fetch").mockRejectedValue(1 as never);
    expect(await fetchFromGenericHttp("x")).toEqual({
      status: "DOWN",
      problemDescription: "Erro desconhecido",
    });
  });
});

describe("wake", () => {
  const healthy = { overall_status: "operational" };
  test("single tenant (tenants endpoint fails) healthy", async () => {
    mockFetch((u) => {
      if (u.endsWith("/tenants")) throw new Error("404");
      return json(healthy);
    });
    expect(await fetchFromWakeStatuspage("https://w.io/path")).toEqual({ status: "OK" });
  });
  test("tenants endpoint returning non-array / empty", async () => {
    mockFetch((u) => (u.endsWith("/tenants") ? json({ not: "array" }) : json(healthy)));
    expect(await fetchFromWakeStatuspage("https://w.io")).toEqual({ status: "OK" });
    mockFetch((u) => (u.endsWith("/tenants") ? json([]) : json(healthy)));
    expect(await fetchFromWakeStatuspage("https://w.io")).toEqual({ status: "OK" });
  });
  test("multiple tenants, mixed health, incident description", async () => {
    const f = mockFetch((u, init) => {
      if (u.endsWith("/tenants"))
        return json([
          { id: "t1", display_name: "One" },
          { id: "t2", display_name: "Two" },
        ]);
      const tenant = (init?.headers as Record<string, string>)["X-Public-Tenant-Id"];
      if (tenant === "t1") return json({ overall_status: "under_maintenance" });
      return json({
        overall_status: "major_outage",
        components: [
          { id: "c1", name: "API", status: "down" },
          { id: "c2", name: "Web", status: "operational" },
        ],
        open_incidents: [
          { title: "Outage", status: "investigating", affected_component_ids: ["c1", "zz"] },
          { affected_component_ids: [] },
          { title: "Solo", status: "" },
        ],
      });
    });
    expect(await fetchFromWakeStatuspage("https://w.io")).toEqual({
      status: "DOWN",
      problemDescription:
        "Two: Outage (investigating - API); Incidente sem título; Solo",
    });
    expect(f).toHaveBeenCalled();
  });
  test("pinned tenant, component fallback and display name from summary", async () => {
    const f = mockFetch(() =>
      json({
        overall_status: "degraded",
        tenant_display_name: "Prod",
        components: [{ id: "c", name: "DB", status: "degraded" }],
      }),
    );
    expect(await fetchFromWakeStatuspage("https://w.io/?tenant=%20abc%20")).toEqual({
      status: "DOWN",
      problemDescription: "Prod: DB: degraded",
    });
    expect(f).toHaveBeenCalledTimes(1);
  });
  test("overall status fallback without name; blank tenant ignored", async () => {
    mockFetch((u) => {
      if (u.endsWith("/tenants")) return json([]);
      return json({ overall_status: "weird", components: [{ id: "c", name: "A", status: "OPERATIONAL" }] });
    });
    expect(await fetchFromWakeStatuspage("https://w.io/?tenant=%20")).toEqual({
      status: "DOWN",
      problemDescription: "Status geral: weird",
    });
  });
  test("summary without overall_status and without components", async () => {
    mockFetch(() => json({}));
    // undefined status is unhealthy
    expect(await fetchFromWakeStatuspage("https://w.io/?tenant=x")).toMatchObject({ status: "DOWN" });
  });
});
