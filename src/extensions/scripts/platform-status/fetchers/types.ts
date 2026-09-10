export type StatusReturn =
    | {
          status: "OK";
      }
    | {
          status: "DOWN";
          problemDescription: string;
      };

export type StatusFetcher = (endpoint: string, traceId: string) => Promise<StatusReturn>;
