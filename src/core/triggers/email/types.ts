export interface EmailAccountConfig {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
}

export type EmailAccountKey = keyof typeof import("./accounts").emailAccounts;