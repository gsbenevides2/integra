// Bun only reports files a test actually loaded, so a 100% threshold alone passes
// vacuously for untested files. This enforces two things from lcov.info:
//   1. every source file is loaded by some test (else it is invisible to coverage);
//   2. every loaded file has all of its lines covered.
// A short, explicit allow-list exempts files that run only in a real browser
// (Web Audio / ONNX runtime), which cannot execute under the test DOM.
import { Glob } from "bun";

/**
 * Files intentionally not line-covered: they need a real AudioWorklet / WebGPU /
 * ONNX session that the happy-dom test environment cannot provide. They are still
 * required to be *loaded* by a test (so a syntax error is caught), just not fully
 * executed. Keep this list tight — add a file only with a reason.
 */
const LINE_COVERAGE_EXEMPT = new Set([
  "public/components/VoiceAssistantContext/fbank.ts", // DSP run inside the audio worklet
  "public/components/VoiceAssistantContext/speakerModel.ts", // ONNX inference session
  "public/components/VoiceAssistantContext/transcriber.ts", // live microphone capture
]);

const lcov = await Bun.file("coverage/lcov.info").text();
const covered = new Set([...lcov.matchAll(/^SF:(.+)$/gm)].map((m) => m[1]!));

// Per-file uncovered line numbers, from the DA:<line>,<hits> records.
const uncovered = new Map<string, number[]>();
let current = "";
for (const line of lcov.split("\n")) {
  if (line.startsWith("SF:")) {
    current = line.slice(3);
    uncovered.set(current, []);
  } else if (line.startsWith("DA:")) {
    const [lineNo, hits] = line.slice(3).split(",").map(Number);
    if (hits === 0) uncovered.get(current)!.push(lineNo!);
  }
}

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

const partial = [...uncovered]
  .filter(([f, lines]) => lines.length > 0 && !LINE_COVERAGE_EXEMPT.has(f))
  .map(([f, lines]) => `${f}: lines ${lines.join(", ")}`);

// A name in the allow-list that is now fully covered (or gone) is dead config.
const staleExempt = [...LINE_COVERAGE_EXEMPT].filter(
  (f) => !uncovered.get(f)?.length,
);

const problems: string[] = [];
if (missing.length) {
  problems.push(`${missing.length} source file(s) never loaded by a test:\n${missing.join("\n")}`);
}
if (partial.length) {
  problems.push(`${partial.length} file(s) with uncovered lines:\n${partial.join("\n")}`);
}
if (staleExempt.length) {
  problems.push(
    `${staleExempt.length} LINE_COVERAGE_EXEMPT entr(y/ies) no longer need the ` +
      `exemption — remove them:\n${staleExempt.join("\n")}`,
  );
}

if (problems.length) {
  console.error(`\n${problems.join("\n\n")}`);
  process.exit(1);
} else {
  console.log("All files fully tested");
}
