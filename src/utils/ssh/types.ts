import z from "zod";

/**
 * Schema Zod para validar informações de status do sistema
 * Inclui memória, discos e rede
 */

// Schema para memória (valores em MB como strings)
const MemoriaSchema = z.object({
    total_mb: z.string().regex(/^\d+$/, "total_mb deve ser uma string numérica"),
    usada_mb: z.string().regex(/^\d+$/, "usada_mb deve ser uma string numérica"),
    livre_mb: z.string().regex(/^\d+$/, "livre_mb deve ser uma string numérica"),
});

// Schema para informações de disco
const DiscoSchema = z.object({
    filesystem: z.string().min(1, "filesystem é obrigatório"),
    total: z.string().regex(/^\d+[.,]?\d*[GM]$/, "total deve estar no formato: 98G ou 2,0G"),
    usado: z.string().regex(/^\d+[.,]?\d*[GM]$/, "usado deve estar no formato: 79G ou 200M"),
    livre: z.string().regex(/^\d+[.,]?\d*[GM]$/, "livre deve estar no formato: 15G ou 1,6G"),
    uso_porcentagem: z.string().regex(/^\d+%$/, "uso_porcentagem deve estar no formato: 85%"),
    montado_em: z.string().min(1, "montado_em é obrigatório"),
});

// Schema para informações de rede (valores em kb/s como strings)
const RedeSchema = z.object({
    rx_kbs: z.string().regex(/^\d+$/, "rx_kbs deve ser uma string numérica"),
    tx_kbs: z.string().regex(/^\d+$/, "tx_kbs deve ser uma string numérica"),
});

// Schema principal para o status do sistema
export const SistemaStatusSchema = z.object({
    memoria: MemoriaSchema,
    discos: z.array(DiscoSchema).min(1, "Deve haver pelo menos um disco"),
    rede: RedeSchema,
});

// Type inferido do schema (TypeScript)
export type SistemaStatus = z.infer<typeof SistemaStatusSchema>;
