export interface LiaUniListItem {
    id: string;
    code: string;
    line: string;
    color: string;
    description: string;
    status: string;
    statusColor: string;
}

export interface LiaUniData {
    type: string;
    listItem: LiaUniListItem[];
    dateUpdate: string;
}

export interface LiaUniResponse {
    status: boolean;
    data: LiaUniData;
}
