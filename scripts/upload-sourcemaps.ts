// `bun run sourcemaps:upload`: sends the maps of the last `bun run build:web`
// to OpenObserve by hand. The daemon does the same thing on startup
// (`server/instrumentation/sourceMaps.ts`), so this is for a first upload, a
// build whose boot upload failed, or a dev machine.
import {
  appVersion,
  buildZip,
  readSourceMaps,
  resolveSettings,
  SOURCEMAP_DIST,
  uploadSourceMaps,
} from "@server/instrumentation/sourceMaps";

/** Reads the version, the settings and the maps, and prints what it will send. */
async function main(): Promise<void> {
  const settings = resolveSettings(process.env, await appVersion());
  const files = await readSourceMaps(SOURCEMAP_DIST);
  if (files.length === 0) {
    throw new Error(
      `nenhum source map em ${SOURCEMAP_DIST}: rode \`bun run build:web\` antes`,
    );
  }
  console.log(
    `🦊 enviando ${files.length} source map(s) como service=${settings.service} ` +
      `env=${settings.env} version=${settings.version}`,
  );
  console.log(await uploadSourceMaps(settings, buildZip(files)));
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
