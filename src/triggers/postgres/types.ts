export interface PostgresConfig {
    url: string;
}

export type PostgresInstanceKey = keyof typeof import("./instances").postgresInstances;