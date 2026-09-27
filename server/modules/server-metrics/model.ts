import { z } from "zod";

const MemoriaSchema = z.object({
  total_mb: z.string().regex(/^\d+$/),
  usada_mb: z.string().regex(/^\d+$/),
  livre_mb: z.string().regex(/^\d+$/),
});

const DiscoSchema = z.object({
  filesystem: z.string().min(1),
  total: z.string().regex(/^\d+[.,]?\d*[GM]$/),
  usado: z.string().regex(/^\d+[.,]?\d*[GM]$/),
  livre: z.string().regex(/^\d+[.,]?\d*[GM]$/),
  uso_porcentagem: z.string().regex(/^\d+%$/),
  montado_em: z.string().min(1),
});

const RedeSchema = z.object({
  rx_kbs: z.string().regex(/^\d+$/),
  tx_kbs: z.string().regex(/^\d+$/),
});

/** Shape of the JSON that the remote `stats.sh` script prints over SSH. */
export const SistemaStatusSchema = z.object({
  memoria: MemoriaSchema,
  discos: z.array(DiscoSchema).min(1),
  rede: RedeSchema,
});

export type SistemaStatus = z.infer<typeof SistemaStatusSchema>;

export const historyQuery = z.object({
  before: z.string().optional().meta({
    title: "Before",
    description: "ISO timestamp cursor — returns snapshots older than this.",
  }),
});
