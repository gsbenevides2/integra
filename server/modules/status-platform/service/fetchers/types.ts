export type StatusReturn =
  | { status: "OK" }
  | { status: "DOWN"; problemDescription: string };

export type StatusFetcher = (endpoint: string) => Promise<StatusReturn>;
