// Prebuilds the frontend and the server: no on-the-fly bundling or TS transpile
// at startup, and a minified server bundle (~25% less idle memory, measured).
// RUM settings are read from GET /client-config at runtime, not inlined here.
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { Glob } from "bun";
import tailwind from "bun-plugin-tailwind";

const WEB_DIST = "dist/web";
// Source maps stay out of WEB_DIST, which `@elysia/static` serves as-is: they
// are for OpenObserve (`bun run sourcemaps:upload`), not for the browser.
const SOURCEMAP_DIST = "dist/sourcemaps";

interface BundledSourceMap {
  sources?: string[];
  sourcesContent?: (string | null)[];
  [key: string]: unknown;
}

const result = await Bun.build({
  entrypoints: ["public/index.html"],
  outdir: WEB_DIST,
  minify: true,
  sourcemap: "external",
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  console.error(result.logs.join("\n"));
  process.exit(1);
}

/**
 * Moves the `.map` files out of the served directory and reports the sources
 * the way OpenObserve shows them: relative to the repo root instead of to the
 * map (`public/components/Foo.tsx`, not `../../public/components/Foo.tsx`).
 */
function rewriteSourceMap(map: BundledSourceMap, path: string): void {
  const sources = map.sources ?? [];
  const content = map.sourcesContent ?? [];
  const root = `${process.cwd()}/`;
  map.sources = sources.map((source) => {
    const absolute = resolve(`${SOURCEMAP_DIST}/${path}`, "..", source);
    return absolute.startsWith(root) ? absolute.slice(root.length) : source;
  });
  // Only the sources we own. node_modules is most of the archive (5.1 of the
  // 7.8 MB here) and its frames only need to resolve to file:line:column,
  // while the snippet Error Tracking shows next to a frame comes from our own
  // files. What is left (~2.5 MB) stays under every documented upload limit.
  map.sourcesContent = sources.map((source, index) =>
    source.includes("node_modules/") ? null : (content[index] ?? null),
  );
}

async function collectSourceMaps(): Promise<void> {
  await rm(SOURCEMAP_DIST, { recursive: true, force: true });
  await mkdir(SOURCEMAP_DIST, { recursive: true });
  let count = 0;
  for await (const path of new Glob("**/*.js.map").scan(WEB_DIST)) {
    const map = (await Bun.file(
      `${WEB_DIST}/${path}`,
    ).json()) as BundledSourceMap;
    rewriteSourceMap(map, path);
    await Bun.write(`${SOURCEMAP_DIST}/${path}`, JSON.stringify(map));
    await rm(`${WEB_DIST}/${path}`);
    count++;
  }
  if (!count) {
    // Without this the deploy would quietly ship a bundle whose errors stay
    // minified in OpenObserve — the whole point of building with source maps.
    console.error(`no source maps in ${WEB_DIST}: check the frontend build`);
    process.exit(1);
  }
  console.log(`🦊 ${count} source map(s) written to ${SOURCEMAP_DIST}`);
}

await collectSourceMaps();

const server = await Bun.build({
  entrypoints: ["server/index.ts"],
  outdir: "dist/server",
  target: "bun",
  minify: true,
});
if (!server.success) {
  console.error(server.logs.join("\n"));
  process.exit(1);
}
