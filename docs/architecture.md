# Architecture

Integra is a modular event-driven integration platform built with **Bun** and **Elysia**. It connects various external services (MQTT, Home Assistant, Redis, PostgreSQL, Email/IMAP, HTTP) and executes user-defined scripts (triggers) in response to events from those services.

## High-Level Flow

```
External Services
  ├─ HTTP (Elysia server)
  ├─ MQTT Broker
  ├─ Home Assistant (WebSocket)
  ├─ Redis (Pub/Sub)
  ├─ PostgreSQL (Polling)
  └─ Email (IMAP IDLE)
       │
       ▼
  ┌─────────────────────────────┐
  │      Trigger Registry       │
  │  (src/triggers/index.ts)    │
  │                             │
  │  - Registers user scripts   │
  │  - Starts service clients   │
  └──────────┬──────────────────┘
             │
             ▼
  ┌─────────────────────────────┐
  │     Instrumentation         │
  │  (src/instrumentation/)     │
  │                             │
  │  - Traces every execution   │
  │  - Logs to MongoDB          │
  │  - Wraps fetch() calls      │
  └─────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────┐
  │    User Scripts (Triggers)  │
  │  (src/scripts/)             │
  │                             │
  │  - Business logic           │
  │  - Can call utils           │
  │  - Can send Discord msgs    │
  └─────────────────────────────┘
```

## Key Concepts

- **Trigger**: A unit of business logic (a script) that responds to an event from an external service.
- **Service Client**: A persistent connection to an external service (MQTT broker, Redis, etc.), managed globally.
- **Instrumentation**: A tracing/logging layer that records every trigger execution into MongoDB for audit/debug.
- **Trace ID**: A `crypto.randomUUID()` assigned per execution, propagated through all events and logs.

## Directory Structure

```
src/
├── index.ts                    # Entry point
├── triggers/
│   ├── index.ts                # Trigger registry + CLI arg parser
│   ├── http/                   # Elysia HTTP server
│   ├── mqtt/                   # MQTT client
│   ├── hass/                   # Home Assistant WebSocket
│   ├── redis/                  # Redis Pub/Sub
│   ├── postgres/               # PostgreSQL polling
│   ├── email/                  # IMAP email listening
│   └── cron/                   # Bun cron jobs
├── instrumentation/
│   ├── index.ts                # Tracer start/end/event functions
│   ├── types.ts                # TypeScript interfaces
│   └── mongo.ts                # Mongoose models & connection
├── scripts/
│   └── authentik/loginFailed/  # Example script
├── utils/
│   ├── safeEnvGet.ts           # Safe env var access
│   └── discord/sendMessage.ts  # Discord webhook sender
└── types/
    └── script.ts               # Shared types (empty)
```