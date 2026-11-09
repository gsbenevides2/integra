import { tlsInit } from "./tls";
import type { StatusFetcher } from "./types";

const REQUEST_TIMEOUT_MS = 20000;

/**
 * Fetches the status of a generic HTTP endpoint by testing if it returns a 200 status code.
 */
export const fetchFromGenericHttp: StatusFetcher = async (endpoint, options) => {
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...tlsInit(options),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    if (response.status === 200) {
      return { status: "OK" };
    }

    return {
      status: "DOWN",
      problemDescription: `Recebeu HTTP ${response.status} em vez de 200`,
    };
  } catch (error) {
    const problemDescription =
      error instanceof Error && error.name === "TimeoutError"
        ? `Tempo de resposta esgotado após ${REQUEST_TIMEOUT_MS / 1000} segundos`
        : error instanceof Error
          ? error.message
          : "Erro desconhecido";

    return { status: "DOWN", problemDescription };
  }
};
