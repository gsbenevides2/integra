import { hasResourceGrant, readableResourceIds } from "@server/shared/authz";

import { z } from "zod";

import { jobRegistry } from "../../../cron";
import { findByName, guardedTool, NO_PERMISSION, type ToolContext } from "./guard";

export function cronTools(ctx: ToolContext) {
  const readableJobs = async () => {
    const readable = await readableResourceIds(ctx.user.id, "cron_job");
    return Array.from(jobRegistry.entries())
      .filter(([name]) => readable.has(name))
      .map(([id, job]) => ({ id, name: job.label, run: job.fn }));
  };

  return [
    guardedTool(ctx, {
      name: "listar_rotinas",
      description:
        "Lista as rotinas automáticas (crons) do Integra que podem ser executadas manualmente.",
      routeKeys: ["GET /api/crons/list"],
      inputSchema: z.object({}),
      execute: async () => ({
        rotinas: (await readableJobs()).map((job) => job.name),
      }),
      summarize: (_input, output) => `Consultou ${output.rotinas.length} rotinas`,
    }),
    guardedTool(ctx, {
      name: "executar_rotina",
      description:
        "Executa agora uma rotina automática pelo nome (ex.: 'teste de velocidade', 'verificar plataformas').",
      routeKeys: ["GET /api/crons/list", "POST /api/crons/run/:jobName"],
      inputSchema: z.object({ rotina: z.string().describe("Nome da rotina") }),
      execute: async ({ rotina }) => {
        const job = findByName(await readableJobs(), rotina, "rotina");
        if ("error" in job) return job;
        if (!(await hasResourceGrant(ctx.user.id, "cron_job", job.id, "execute"))) {
          return NO_PERMISSION;
        }
        const start = Date.now();
        await job.run();
        return { rotina: job.name, duracaoMs: Date.now() - start };
      },
      summarize: (_input, output) => `Executou ${output.rotina}`,
    }),
  ];
}
