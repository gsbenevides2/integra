export interface TrainStatusPlataform {
    codigo: number;
    cor: string;
    situacao: string;
    status: "OK" | "WARNING" | "CRITICAL" | "UNKNOWN";
    descricao?: string;
}
