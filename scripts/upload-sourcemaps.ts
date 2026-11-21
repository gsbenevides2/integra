// Uploads the frontend source maps written by `bun run build:web` to
// OpenObserve, so RUM Error Tracking translates the minified stack traces back
// to `public/…` files, lines and columns.
//
//   NODE_ENV=production bun run build:web && bun run sourcemaps:upload
//
// `service`, `env` and `version` must match the RUM SDK configuration exactly
// (case-sensitive) — they are the key OpenObserve looks the map up with. The
// first comes from public/telemetry.ts, the version from package.json (both
// baked into the bundle) and the env from NODE_ENV at upload time, exactly like
// GET /client-config reports it to the browser.
//
// Needs PUBLIC_RUM_SITE, PUBLIC_OTEL_ORGANIZATION and
// OPENOBSERVE_SOURCEMAP_TOKEN (an OpenObserve API token with the `sourcemaps`
// RBAC permission — the RUM client token shipped to browsers cannot write them).
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { Glob } from "bun";

import { RUM_SERVICE_NAME } from "../public/telemetry";

export const SOURCEMAP_DIST = "dist/sourcemaps";

const BOUNDARY = "----integra-sourcemaps";
const DOS_DATE = 0x21; // 1980-01-01, the earliest ZIP can represent
const DOS_TIME = 0;

/** One `.map` file, named as the minified file it belongs to (`foo.js.map`). */
export interface SourceMapFile {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Everything OpenObserve needs to store a map where the SDK looks for it. */
export interface UploadSettings {
  endpoint: string;
  authorization: string;
  service: string;
  env: string;
  version: string;
}

/** Resolves the endpoint and credentials, or explains what is missing. */
export function resolveSettings(
  env: NodeJS.ProcessEnv,
  version: string,
): UploadSettings {
  const site = env.PUBLIC_RUM_SITE;
  const organization = env.PUBLIC_OTEL_ORGANIZATION;
  const token = env.OPENOBSERVE_SOURCEMAP_TOKEN;
  if (!site || !organization || !token) {
    const missing = [
      ["PUBLIC_RUM_SITE", site],
      ["PUBLIC_OTEL_ORGANIZATION", organization],
      ["OPENOBSERVE_SOURCEMAP_TOKEN", token],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(`missing environment: ${missing.join(", ")}`);
  }
  const host = site.startsWith("http") ? site : `https://${site}`;
  const user = env.OPENOBSERVE_SOURCEMAP_USER ?? "default";
  return {
    endpoint: `${host.replace(/\/+$/, "")}/api/${organization}/sourcemaps`,
    authorization: `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`,
    service: RUM_SERVICE_NAME,
    env: env.NODE_ENV === "production" ? "production" : "development",
    version,
  };
}

/** Reads every map from the build output, keeping only its file name. */
export async function readSourceMaps(dir: string): Promise<SourceMapFile[]> {
  const files: SourceMapFile[] = [];
  for await (const path of new Glob("**/*.js.map").scan(dir)) {
    const bytes = new Uint8Array(await Bun.file(join(dir, path)).arrayBuffer());
    files.push({ name: path.split("/").pop()!, bytes });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Writes a ZIP (deflated entries, no zip64) holding the maps. Only `.js.map`
 * files go in: OpenObserve pairs each map with the minified file it resolves,
 * and rejects the whole archive when it finds a `.js` whose map is missing.
 */
export function buildZip(files: SourceMapFile[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const deflated = new Uint8Array(deflateRawSync(file.bytes));
    const crc = crc32(file.bytes);

    const header = new Uint8Array(30 + name.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x04034b50, true); // local file header
    headerView.setUint16(4, 20, true); // version needed to extract
    headerView.setUint16(8, 8, true); // method: deflate
    headerView.setUint16(10, DOS_TIME, true);
    headerView.setUint16(12, DOS_DATE, true);
    headerView.setUint32(14, crc, true);
    headerView.setUint32(18, deflated.length, true);
    headerView.setUint32(22, file.bytes.length, true);
    headerView.setUint16(26, name.length, true);
    header.set(name, 30);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // central directory header
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed to extract
    centralView.setUint16(10, 8, true); // method: deflate
    centralView.setUint16(12, DOS_TIME, true);
    centralView.setUint16(14, DOS_DATE, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, deflated.length, true);
    centralView.setUint32(24, file.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true); // offset of its local header
    centralHeader.set(name, 46);

    locals.push(header, deflated);
    central.push(centralHeader);
    offset += header.length + deflated.length;
  }

  const centralBytes = concat(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); // end of central directory
  endView.setUint16(8, files.length, true); // entries on this disk
  endView.setUint16(10, files.length, true); // entries in total
  endView.setUint32(12, centralBytes.length, true);
  endView.setUint32(16, offset, true);
  return concat([...locals, centralBytes, end]);
}

/** The multipart body, built by hand to send the Content-Length the API wants. */
export function multipartBody(
  settings: UploadSettings,
  zip: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const field = (name: string, value: string) =>
    encoder.encode(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  return concat([
    field("service", settings.service),
    field("env", settings.env),
    field("version", settings.version),
    encoder.encode(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="sourcemaps.zip"\r\nContent-Type: application/zip\r\n\r\n`,
    ),
    zip,
    encoder.encode(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

/** Posts the ZIP; returns OpenObserve's message, or throws with its refusal. */
export async function uploadSourceMaps(
  settings: UploadSettings,
  zip: Uint8Array,
  post: typeof fetch = fetch,
): Promise<string> {
  // A view on a plain ArrayBuffer, which is what `fetch` takes as a body.
  const body = multipartBody(settings, zip);
  const response = await post(settings.endpoint, {
    method: "POST",
    headers: {
      authorization: settings.authorization,
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
      "content-length": String(body.length),
    },
    body,
  });
  const message = await response.text();
  if (!response.ok) {
    throw new Error(`OpenObserve refused the upload: ${response.status} ${message}`);
  }
  return message;
}

/** Uploads every map in `dist`, the directory `bun run build:web` writes. */
export async function main(dist: string = SOURCEMAP_DIST): Promise<void> {
  const version = ((await Bun.file("package.json").json()) as { version: string })
    .version;
  const settings = resolveSettings(process.env, version);
  const files = await readSourceMaps(dist);
  if (!files.length) {
    throw new Error(`no source maps in ${dist}: run \`bun run build:web\` first`);
  }
  console.log(
    `🦊 uploading ${files.length} source map(s) as service=${settings.service} ` +
      `env=${settings.env} version=${settings.version}`,
  );
  console.log(await uploadSourceMaps(settings, buildZip(files)));
}

/** CLI entry point: a failure is a message plus a non-zero exit code. */
export async function run(dist: string = SOURCEMAP_DIST): Promise<void> {
  await main(dist).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

if (import.meta.main) await run();
