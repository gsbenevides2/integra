import { buildSegments } from "@server/modules/train-status/service/history";

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { makeFakeDb } from "../../../helpers/modules-db";

let fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const { processCCRLines } = await import("@server/modules/train-status/service/fetchers/ccr");
const { processCPTMLines } = await import("@server/modules/train-status/service/fetchers/cptm");
const { processLiaUniLines } = await import("@server/modules/train-status/service/fetchers/liauni");
const { processMetroLines } = await import("@server/modules/train-status/service/fetchers/metro");
const { processTICLines } = await import("@server/modules/train-status/service/fetchers/tic");
const { getTrainLinesStatus } = await import("@server/modules/train-status/service/fetchers");
let override: (() => Promise<never[]>) | undefined;
mock.module("@server/modules/train-status/service/fetchers", () => ({
  getTrainLinesStatus: () => (override ? override() : getTrainLinesStatus()),
}));
const { TrainStatusService } = await import("@server/modules/train-status/service/checks");
const { checkTrainLinesStatus } = await import("@server/modules/train-status/jobs/checkStatus");
const { trainStatusRoutes } = await import("@server/modules/train-status/index");
const { TRAIN_LINES } = await import("@server/modules/train-status/model");

let fetchSpy: ReturnType<typeof spyOn>;
function respond(handler: (url: string) => Response) {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((u: unknown) =>
    Promise.resolve(handler(String(u)))) as never);
}
afterEach(() => fetchSpy?.mockRestore());

const ccrBody = {
  data: {
    concessoes: [
      {
        linhas: [
          { numero: 4, statusLinha: { status: "Operação normal", descricao: "ok" } },
          { numero: "5", statusLinha: { status: "Paralisada" } },
        ],
      },
    ],
  },
};
const cptmBody = [
  { linhaId: 10, status: "Velocidade reduzida", descricao: "slow" },
  { linhaId: 11, status: "Operação normal", descricao: "" },
];
const liaBody = { data: { listItem: [{ status: "Operação normal", description: "d" }] } };
const ticBody = { data: [{ status: { name: "Paralisada" }, description: null }] };
const metroHtml = `
<div class="direto-metro">
  <div class="linha">
    <div class="linha-numero" style="background-color: red">1</div>
    <div class="linha-nome">Azul</div>
    <div class="linha-info" data-bs-title='<span class="title">Metro</span><span class="description">desc</span><span class="date">hoje</span>'></div>
    <div class="linha-situacao">Operação normal</div>
    <div class="linha-situacao-icon" style="background-color: green"></div>
  </div>
  <div class="linha">
    <div class="linha-numero">2</div>
    <div class="linha-nome">Verde</div>
    <div class="linha-situacao">Paralisada</div>
    <div class="linha-situacao-icon"></div>
  </div>
</div>`;

function routeAll(url: string): Response {
  if (url.includes("ccr")) return Response.json(ccrBody);
  if (url.includes("cptm")) return Response.json(cptmBody);
  if (url.includes("linhauni")) return Response.json(liaBody);
  if (url.includes("tictrens")) return Response.json(ticBody);
  return new Response(metroHtml);
}

describe("fetchers", () => {
  test("ccr", async () => {
    respond(() => Response.json(ccrBody));
    const r = await processCCRLines();
    expect(r.find((l) => l.codigo === 4)).toMatchObject({ status: "OK", descricao: "ok" });
    expect(r.find((l) => l.codigo === 5)).toMatchObject({ status: "CRITICAL", descricao: "" });
    expect(r.find((l) => l.codigo === 8)).toMatchObject({ status: "UNKNOWN", situacao: "" });
  });
  test("cptm", async () => {
    respond(() => Response.json(cptmBody));
    const r = await processCPTMLines();
    expect(r.find((l) => l.codigo === 10)?.status).toBe("WARNING");
    expect(r.find((l) => l.codigo === 12)?.status).toBe("UNKNOWN");
  });
  test("liauni with and without item", async () => {
    respond(() => Response.json(liaBody));
    expect((await processLiaUniLines())[0]).toMatchObject({ codigo: 6, status: "OK", descricao: "d" });
    fetchSpy.mockRestore();
    respond(() => Response.json({ data: { listItem: [] } }));
    expect((await processLiaUniLines())[0]).toMatchObject({ codigo: 6, status: "UNKNOWN", descricao: "" });
  });
  test("tic with and without item", async () => {
    respond(() => Response.json(ticBody));
    expect((await processTICLines())[0]).toMatchObject({ codigo: 7, status: "CRITICAL", descricao: "" });
    fetchSpy.mockRestore();
    respond(() => Response.json({ data: [] }));
    expect((await processTICLines())[0]).toMatchObject({ codigo: 7, status: "UNKNOWN" });
  });
  test("metro parses html", async () => {
    respond(() => new Response(metroHtml));
    const r = await processMetroLines();
    expect(r.find((l) => l.codigo === 1)).toMatchObject({ status: "OK", descricao: "desc" });
    expect(r.find((l) => l.codigo === 2)).toMatchObject({ status: "CRITICAL", descricao: "" });
    expect(r.find((l) => l.codigo === 3)).toMatchObject({ status: "UNKNOWN" });
  });
  test("index merges all, sorted", async () => {
    respond(routeAll);
    const r = await getTrainLinesStatus();
    expect(r.map((l) => l.codigo)).toEqual(TRAIN_LINES.map((l) => l.code).sort((a, b) => a - b));
  });
});

test("buildSegments", () => {
  const mk = (status: "OK" | "WARNING", m: number) => ({
    status,
    situation: "s",
    description: null,
    checkedAt: new Date(Date.UTC(2026, 0, 1, 0, m)),
  });
  const segs = buildSegments([mk("OK", 0), mk("OK", 1), mk("WARNING", 2)]);
  expect(segs).toHaveLength(2);
  expect(segs[0]!.endedAt).toBe("2026-01-01T00:02:00.000Z");
  expect(segs[1]!.endedAt).toBeNull();
});

describe("TrainStatusService", () => {
  beforeEach(() => {
    fake = makeFakeDb();
  });

  test("checkAll inserts, and skips when no lines", async () => {
    respond(routeAll);
    await TrainStatusService.checkAll();
    expect(fake.calls).toContain("values");
  });

  test("checkAll with empty result does not insert", async () => {
    override = async () => [];
    await TrainStatusService.checkAll();
    override = undefined;
    expect(fake.calls).not.toContain("values");
  });

  test("job delegates to checkAll", async () => {
    respond(routeAll);
    await checkTrainLinesStatus();
    expect(fake.calls).toContain("values");
  });

  test("listLatest sorts by code", async () => {
    fake.push([{ lineCode: 3 }, { lineCode: 1 }]);
    expect(await TrainStatusService.listLatest()).toEqual([{ lineCode: 1 }, { lineCode: 3 }]);
  });

  test("getHistory", async () => {
    const checks = Array.from({ length: 100 }, (_, i) => ({
      status: "OK",
      situation: "s",
      description: null,
      checkedAt: new Date(Date.UTC(2026, 0, 1, 0, 100 - i)),
    }));
    fake.push(checks, []);
    const full = await TrainStatusService.getHistory(1, new Date());
    expect(full.hasMore).toBe(true);
    expect(full.nextCursor).toBe(checks[99]!.checkedAt.toISOString());
    expect(await TrainStatusService.getHistory(1, new Date())).toMatchObject({
      hasMore: false,
      nextCursor: null,
    });
  });

  test("constructor", () => {
    expect(new (TrainStatusService as never as new () => object)()).toBeObject();
  });
});

describe("routes", () => {
  beforeEach(() => {
    fake = makeFakeDb();
  });
  const call = (p: string) => trainStatusRoutes.handle(new Request(`http://localhost${p}`));
  test("lines", async () => {
    fake.push([{ lineCode: 1 }]);
    expect(await (await call("/api/train-status/lines")).json()).toEqual([{ lineCode: 1 }]);
  });
  test("history with and without before", async () => {
    fake.push([], []);
    const a = await call("/api/train-status/1/history?before=2026-01-01T00:00:00Z");
    expect((await a.json()).checks).toEqual([]);
    const b = await call("/api/train-status/1/history");
    expect((await b.json()).hasMore).toBe(false);
  });
});
