import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import { expect, spyOn, test } from "bun:test";

import {
  buildZip,
  main,
  readSourceMaps,
  resolveSettings,
  run,
  type UploadSettings,
  uploadSourceMaps,
} from "../../scripts/upload-sourcemaps";

const MAP = '{"version":3,"mappings":"AAAA"}';
// CRC32 of MAP, from an independent implementation (zlib).
const MAP_CRC32 = 0x985e6851;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const FILES = [{ name: "chunk-abc.js.map", bytes: encoder.encode(MAP) }];

function settings(overrides: Partial<UploadSettings> = {}): UploadSettings {
  return {
    endpoint: "https://openobserve.example.com/api/org/sourcemaps",
    authorization: "Basic abc",
    service: "integra-web",
    env: "production",
    version: "2.3.0",
    ...overrides,
  };
}

test("resolveSettings maps the RUM config onto the upload triple", () => {
  const env = {
    PUBLIC_RUM_SITE: "openobserve.example.com/",
    PUBLIC_OTEL_ORGANIZATION: "acme",
    OPENOBSERVE_SOURCEMAP_TOKEN: "o2oi_secret",
  };
  expect(resolveSettings(env, "2.3.0")).toEqual({
    endpoint: "https://openobserve.example.com/api/acme/sourcemaps",
    authorization: `Basic ${Buffer.from("default:o2oi_secret").toString("base64")}`,
    service: "integra-web",
    env: "development",
    version: "2.3.0",
  });

  // A site that already carries a scheme is used as-is, and so is a custom user.
  expect(
    resolveSettings(
      {
        ...env,
        PUBLIC_RUM_SITE: "http://localhost:5080",
        OPENOBSERVE_SOURCEMAP_USER: "gui@gui.dev.br",
        NODE_ENV: "production",
      },
      "2.3.0",
    ),
  ).toMatchObject({
    endpoint: "http://localhost:5080/api/acme/sourcemaps",
    authorization: `Basic ${Buffer.from("gui@gui.dev.br:o2oi_secret").toString("base64")}`,
    env: "production",
  });
});

test("resolveSettings names every missing variable at once", () => {
  expect(() => resolveSettings({}, "2.3.0")).toThrow(
    "missing environment: PUBLIC_RUM_SITE, PUBLIC_OTEL_ORGANIZATION, OPENOBSERVE_SOURCEMAP_TOKEN",
  );
});

test("readSourceMaps takes every map and nothing else", async () => {
  const dir = await mkdtemp(join(tmpdir(), "integra-sourcemaps-"));
  await Bun.write(join(dir, "chunk-abc.js.map"), MAP);
  await Bun.write(join(dir, "chunk-abc.js"), "minified");
  await Bun.write(join(dir, "nested/chunk-def.js.map"), MAP);

  const files = await readSourceMaps(dir);
  expect(files.map((file) => file.name)).toEqual([
    "chunk-abc.js.map",
    "chunk-def.js.map",
  ]);
  expect(decoder.decode(files[0]!.bytes)).toBe(MAP);
  await rm(dir, { recursive: true, force: true });
});

test("buildZip writes a readable, deflated archive", () => {
  const zip = buildZip(FILES);

  // End of central directory: one entry, a directory that closes the file.
  const end = new DataView(zip.buffer, zip.length - 22, 22);
  expect(end.getUint32(0, true)).toBe(0x06054b50);
  expect(end.getUint16(10, true)).toBe(1);
  const centralOffset = end.getUint32(16, true);
  expect(new DataView(zip.buffer, centralOffset, 4).getUint32(0, true)).toBe(
    0x02014b50,
  );
  expect(centralOffset + end.getUint32(12, true) + 22).toBe(zip.length);

  // Local file header, with the CRC of the original bytes (not the deflated ones).
  const header = new DataView(zip.buffer, 0, 30);
  expect(header.getUint32(0, true)).toBe(0x04034b50);
  expect(header.getUint16(8, true)).toBe(8); // deflate
  expect(header.getUint32(14, true)).toBe(MAP_CRC32);
  expect(header.getUint32(22, true)).toBe(MAP.length);
  expect(centralOffset).toBe(30 + header.getUint16(26, true) + header.getUint32(18, true));
  const nameLength = header.getUint16(26, true);
  expect(decoder.decode(zip.subarray(30, 30 + nameLength))).toBe(
    "chunk-abc.js.map",
  );

  const compressed = zip.subarray(
    30 + nameLength,
    30 + nameLength + header.getUint32(18, true),
  );
  expect(decoder.decode(inflateRawSync(compressed))).toBe(MAP);
});

/** Stands in for OpenObserve, recording what the upload would have sent. */
function recorder(status: number, message: string) {
  const calls: { url: string; init: RequestInit }[] = [];
  const post = (async (url: string | URL | Request, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(message, { status });
  }) as unknown as typeof fetch;
  return { calls, post };
}

test("uploadSourceMaps posts the fields OpenObserve matches on", async () => {
  const { calls, post } = recorder(201, "successfully stored sourcemaps");
  const zip = buildZip(FILES);

  const message = await uploadSourceMaps(
    settings({ endpoint: "https://openobserve.example.com/api/acme/sourcemaps" }),
    zip,
    post,
  );

  expect(message).toBe("successfully stored sourcemaps");
  expect(calls[0]!.url).toBe(
    "https://openobserve.example.com/api/acme/sourcemaps",
  );
  const headers = calls[0]!.init.headers as Record<string, string>;
  expect(headers.authorization).toBe("Basic abc");
  const body = new Uint8Array(calls[0]!.init.body as Uint8Array);
  // The API refuses the upload outright without a Content-Length.
  expect(headers["content-length"]).toBe(String(body.length));

  const boundary = headers["content-type"]!.split("boundary=")[1]!;
  const closing = encoder.encode(`\r\n--${boundary}--\r\n`);
  const zipStart = body.length - closing.length - zip.length;
  const fields = decoder.decode(body.subarray(0, zipStart));
  expect(fields).toContain('name="service"\r\n\r\nintegra-web');
  expect(fields).toContain('name="env"\r\n\r\nproduction');
  expect(fields).toContain('name="version"\r\n\r\n2.3.0');
  expect(fields).toContain('name="file"; filename="sourcemaps.zip"');
  expect(body.subarray(zipStart, zipStart + zip.length)).toEqual(zip);
  expect(decoder.decode(body.subarray(zipStart + zip.length))).toBe(
    `\r\n--${boundary}--\r\n`,
  );
});

test("a refusal surfaces OpenObserve's own message", async () => {
  const { post } = recorder(400, "File is missing or empty");

  await expect(
    uploadSourceMaps(settings(), buildZip(FILES), post),
  ).rejects.toThrow("400 File is missing or empty");
});

/** The env `main` reads, set only for the duration of one test. */
function useUploadEnv(): () => void {
  const names = [
    "PUBLIC_RUM_SITE",
    "PUBLIC_OTEL_ORGANIZATION",
    "OPENOBSERVE_SOURCEMAP_TOKEN",
  ];
  const previous = names.map((name) => [name, process.env[name]] as const);
  process.env.PUBLIC_RUM_SITE = "openobserve.example.com";
  process.env.PUBLIC_OTEL_ORGANIZATION = "acme";
  process.env.OPENOBSERVE_SOURCEMAP_TOKEN = "o2oi_test";
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

test("main uploads what build:web wrote, and asks for it when empty", async () => {
  const restoreEnv = useUploadEnv();
  const log = spyOn(console, "log").mockImplementation(() => {});
  const post = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("successfully stored sourcemaps", { status: 201 }),
  );
  const empty = await mkdtemp(join(tmpdir(), "integra-maps-empty-"));
  const dir = await mkdtemp(join(tmpdir(), "integra-maps-"));

  try {
    await expect(main(empty)).rejects.toThrow("run `bun run build:web` first");
    expect(post).not.toHaveBeenCalled();

    await Bun.write(join(dir, "chunk-abc.js.map"), MAP);
    await main(dir);

    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0]!;
    expect(url).toBe("https://openobserve.example.com/api/acme/sourcemaps");
    expect(init!.method).toBe("POST");
    expect(log.mock.calls.at(-1)![0]).toBe("successfully stored sourcemaps");
  } finally {
    log.mockRestore();
    post.mockRestore();
    restoreEnv();
    await rm(empty, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("run turns a failure into a message and a non-zero exit code", async () => {
  const error = spyOn(console, "error").mockImplementation(() => {});
  const empty = await mkdtemp(join(tmpdir(), "integra-maps-none-"));

  try {
    await run(empty);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("missing environment: PUBLIC_RUM_SITE"),
    );
    expect(process.exitCode).toBe(1);
  } finally {
    // Bun latches a non-zero exit code until the process ends, so leaving it
    // set would fail the whole suite instead of just this test.
    process.exitCode = 0;
    error.mockRestore();
    await rm(empty, { recursive: true, force: true });
  }
});
