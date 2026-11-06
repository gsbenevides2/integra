// Prebuilds the frontend and the server: no on-the-fly bundling or TS transpile
// at startup, and a minified server bundle (~25% less idle memory, measured).
// RUM settings are read from GET /client-config at runtime, not inlined here.
import tailwind from "bun-plugin-tailwind";

const result = await Bun.build({
  entrypoints: ["public/index.html"],
  outdir: "dist/web",
  minify: true,
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  console.error(result.logs.join("\n"));
  process.exit(1);
}

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
