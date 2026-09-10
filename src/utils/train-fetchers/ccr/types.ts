export interface CCRResponse {
    status: boolean;
    message: string;
    errorCode: string;
    data: CCRData;
}

export interface CCRData {
    dataAtualizacao: string;
    concessoes: CCRConcession[];
}

export interface CCRConcession {
    uid: string;
    nome: string;
    estados: string;
    logo: CCRLogo;
    linhas: CCRLine[];
}

export interface CCRLogo {
    _path: string;
}

export interface CCRLine {
    uid: string;
    numero: number | string;
    nome: string;
    icone: CCRIcon;
    corRgb: string;
    statusLinha: CCRStatusLine;
}

export interface CCRIcon {
    _path: string;
}

export interface CCRStatusLine {
    codigo: string;
    status: string;
    descricao?: string;
}
