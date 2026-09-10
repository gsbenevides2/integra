export interface TICOwnerLineResponse {
    status: boolean;
    data: TICOwnerLine[];
}

export interface TICOwnerLine {
    id: number;
    type: string;
    status: TICOwnerLineStatus;
    description: string | null;
}

export interface TICOwnerLineStatus {
    id: number;
    name: string;
    statusCode: number;
    statusColor: string;
}
