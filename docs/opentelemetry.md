# OpenTelemetry Tracing no Integra

## Visão Geral

O Integra agora possui rastreamento distribuído (tracing) de ponta a ponta
usando [OpenTelemetry](https://opentelemetry.io/). Cada requisição HTTP,
mensagem WebSocket, operação no banco de dados, chamada Redis e chamada HTTP
externa produz spans que são exportados via protocolo OTLP para um collector.

Isso permite visualizar a cadeia completa de uma operação — do clique no
frontend até o SQL no PostgreSQL — em ferramentas como **Jaeger**,
**SigNoz**, **Grafana Tempo** ou **Honeycomb**.

## Stack instrumentada

| Camada | Tecnologia | Instrumentação |
|--------|-----------|----------------|
| Frontend | React (Next.js) | `@opentelemetry/instrumentation-fetch`, `@opentelemetry/instrumentation-xml-http-request`, `@opentelemetry/instrumentation-document-load`, `@opentelemetry/instrumentation-user-interaction` |
| Backend HTTP | Elysia (Bun) | Middleware customizado em `src/core/opentelemetry/elysia.ts` |
| WebSocket | Bun ws | `createTracedWsHandler` em `src/core/opentelemetry/websocket.ts` |
| Banco de Dados | PostgreSQL via Drizzle ORM | Proxy no cliente SQL em `src/core/opentelemetry/db.ts` |
| Cache | Redis (Bun nativo) | Proxy via `instrumentRedis` em `src/core/opentelemetry/redis.ts` |
| HTTP externo | Bun fetch + axios | `createTracedFetch` e `instrumentAxios` em `src/core/opentelemetry/fetch.ts` |

## Como funciona

1. **No startup** (`src/core/index.ts` → `setupOpenTelemetry()`):
   - Cria um `TracerProvider` com exportador OTLP HTTP
   - Registra o `AsyncHooksContextManager` para propagação de contexto assíncrono
   - Aplica sampler configurável via variável de ambiente

2. **Requisições HTTP**:
   - O middleware extrai headers W3C Trace Context (`traceparent`/`tracestate`)
     de requisições recebidas
   - Cria um span raiz com atributos semânticos (HTTP method, URL, status code)
   - Finaliza o span no `onAfterResponse` ou `onError`

3. **Requisições HTTP de saída**:
   - `createTracedFetch` e `instrumentAxios` criam spans filhas
   - Propagam o contexto W3C Trace Context via headers

4. **Redis**:
   - `instrumentRedis` usa um `Proxy` para interceptar chamadas
   - Cada comando (GET, SET, DEL, etc.) vira um span filho

5. **PostgreSQL**:
   - `instrumentDbClient` intercepta `query()` e `execute()`
   - Atributos semânticos: `db.system=postgresql`, `db.statement` (SQL truncado)

6. **WebSocket**:
   - `createTracedWsHandler` envolve o handler de mensagens
   - Cada mensagem recebida vira um span

7. **Frontend**:
   - Script carregado no navegador via `<script defer>` em `App.tsx`
   - Instrumenta fetch/XMLHttpRequest automaticamente
   - Rastreia cliques em botões e links
   - Rastreia navegação SPA (pushState/popstate)
   - Captura erros não tratados

## Configuração via variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | URL base do collector OTLP |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | (usado se definido) | URL específica para traces (sobrescreve o endpoint base) |
| `OTEL_SERVICE_NAME` | `integra` | Nome do serviço nos traces |
| `OTEL_SERVICE_VERSION` | `1.0.0` | Versão nos traces |
| `OTEL_ENVIRONMENT` | `development` | Ambiente (development, staging, production) |
| `OTEL_SAMPLE_RATE` | `1.0` | Taxa de amostragem (0.0 = desligado, 1.0 = tudo, 0.1 = 10%) |

> **Fail-safe**: Se o collector OTLP estiver fora do ar, spans são descartados
> silenciosamente — o Integra não quebra nem retarda requisições. O batch
> processor tem timeout de 10s para exportação.

## Rodando localmente com Jaeger

```bash
# 1. Sobe Jaeger + OpenTelemetry Collector
docker compose -f docker-compose.otel.yml up -d

# 2. (Opcional) Configura variáveis para apontar para o collector
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_SAMPLE_RATE=1.0

# 3. Inicia o Integra
bun run dev

# 4. Abre o Jaeger UI
open http://localhost:16686
```

## Rodando localmente com SigNoz

Edite `docker-compose.otel.yml` e descomente o serviço `signoz`.
Depois configure:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_ENVIRONMENT=development
```

## Estrutura dos arquivos

```
src/core/opentelemetry/
  config.ts      — Configuração via variáveis de ambiente
  tracer.ts      — TracerProvider, exportador OTLP, shutdown
  elysia.ts      — Middleware Elysia para tracing HTTP
  fetch.ts       — Wrappers para Bun fetch e Axios
  redis.ts       — Proxy para instrumentar Redis
  db.ts          — Proxy para instrumentar PostgreSQL/Drizzle
  websocket.ts   — Wrapper para tracing de WebSocket
  frontend.ts    — Script de tracing para o navegador
  index.ts       — Setup unificado, re-exports
```

## Como desabilitar

Defina `OTEL_SAMPLE_RATE=0` para desligar completamente o tracing
(span sempre off). Alternativamente, remova a chamada `setupOpenTelemetry()`
em `src/core/triggers/http/index.ts`.

## Critérios de aceite

1. Um clique no frontend produz um trace completo (ação do usuário → chamada
   API → SQL → resposta)
2. Operações WebSocket produzem traces com mensagem recebida, processamento e
   resposta
3. Operações Redis aparecem como spans filhas
4. Chamadas HTTP externas aparecem como spans filhas
5. Contexto W3C Trace Context propagado via headers HTTP
6. Erros e exceções visíveis no trace (attributo `error=true` no span)
7. Sample rate configurável via variável de ambiente
8. Spans têm atributos semânticos padronizados
9. Código não quebra se collector OTLP estiver fora do ar
