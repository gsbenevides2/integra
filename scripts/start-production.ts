/**
 * Production startup: applies database schema changes then starts the server.
 *
 * Runs `drizzle-kit push --force` (non-interactive) before handing control to
 * the bundled server.  If the schema is already up to date the push is a no-op;
 * if it fails the server still starts (the failure is logged) so that a
 * transient database issue does not keep the whole container down.
 *
 * In development the server is started directly with `bun run dev`; this script
 * is only used in the production Docker image.
 */
import { $ } from "bun";

const CONFIG = "server/db/drizzle.config.ts";
const SERVER_CMD = ["bun", "dist/server/index.js"];

type RunMigrationResult = { exitCode: number; stderr?: Buffer; stdout?: Buffer };

export async function startProduction(
  runMigration?: () => Promise<RunMigrationResult>,
  spawnServer?: (cmd: string[]) => PromiseLike<{ exitCode: number }>,
): Promise<void> {
  const migrate = runMigration ?? (
    () => $`bun run drizzle-kit push --force --config ${CONFIG}`.nothrow()
  );
  const spawn = spawnServer ?? (
    (cmd: string[]) => Bun.spawn({
      cmd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
  );

  console.error("[startup] Running database schema sync...");

  const result = await migrate();

  if (result.exitCode === 0) {
    console.error("[startup] Database schema sync completed.");
  } else {
    const stderr = result.stderr?.toString() ?? "";
    const stdout = result.stdout?.toString() ?? "";
    console.error(
      "[startup] Database schema sync failed (non-fatal), continuing...",
    );
    for (const line of (stderr + stdout).split("\n").filter(Boolean)) {
      console.error(`[startup]   ${line}`);
    }
  }

  const server = spawn(SERVER_CMD);
  const { exitCode } = await server;
  process.exit(exitCode);
}

// ── Entrypoint ───────────────────────────────────────────────────────────────
await startProduction();