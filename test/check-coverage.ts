// Bun only reports files a test actually loaded, so a 100% threshold alone passes
// vacuously for untested files. Fail if any source file is missing from lcov.info.
import { Glob } from "bun";

const lcov = await Bun.file("coverage/lcov.info").text();
const covered = new Set([...lcov.matchAll(/^SF:(.+)$/gm)].map((m) => m[1]));

const missing: string[] = [];
for (const dir of ["server", "public"]) {
  for await (const f of new Glob(`${dir}/**/*.{ts,tsx}`).scan(".")) {
    if (/\.test\.tsx?$|\.d\.ts$/.test(f)) continue;
    if (covered.has(f)) continue;
    // type-only files transpile to nothing, so they never show up in lcov
    const loader = f.endsWith("x") ? "tsx" : "ts";
    const js = new Bun.Transpiler({ loader }).transformSync(
      await Bun.file(f).text(),
    );
    if (js.replace(/export\s*\{\s*\};?/g, "").trim()) missing.push(f);
  }
}

if (missing.length) {
  console.error(
    `\n${missing.length} source file(s) never loaded by a test:\n${missing.join("\n")}`,
  );
  process.exit(1);
} else {
  console.log("All files tested");
}
