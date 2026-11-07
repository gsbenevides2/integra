export type StatusReturn =
  | { status: "OK" }
  | { status: "DOWN"; problemDescription: string };

export interface FetcherOptions {
  /** Skip SSL/TLS certificate validation for the monitored host. */
  ignoreSsl?: boolean;
}

export type StatusFetcher = (
  endpoint: string,
  options?: FetcherOptions,
) => Promise<StatusReturn>;
