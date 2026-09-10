export type TrainLineStatus = "OK" | "WARNING" | "CRITICAL" | "UNKNOWN";

export type TrainCompany = "metro" | "cptm" | "ccr" | "tic" | "liauni";

export interface TrainLineData {
    code: number;
    color: string;
    company: TrainCompany;
    cssColor: string;
}

export interface ProcessedTrainLine {
    codigo: number;
    cor: string;
    situacao: string;
    status: TrainLineStatus;
    descricao?: string;
}
