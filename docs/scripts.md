# Scripts

Scripts contain the actual business logic triggered by external events. They live under `src/scripts/` and are organized by service.

## Example: Authentik Login Failed

File: `src/scripts/authentik/loginFailed/`

This script listens for HTTP POST events from **Authentik** (an SSO provider) when a login attempt fails, and sends a formatted Discord notification.

### Structure

```
src/scripts/authentik/loginFailed/
├── index.ts    # Trigger definition & Elysia route
├── types.ts    # Zod request body schema
└── utils.ts    # Message formatting logic
```

### How It Works

1. Authentik sends a POST to `/authentik-login-failed` with login attempt details
2. The body is validated with Zod (`loginFailedBody`)
3. `generateMessage()` parses the Authentik payload and formats a Discord message
4. The message is sent to a Discord channel via `sendDiscordMessage()`
5. Events are logged via instrumentation (`addTracerEvent`)

### Creating a New Script

1. Create a folder under `src/scripts/<service>/<name>/
2. Define your types (Zod schemas for validation)
3. Implement your business logic (utils, helpers)
4. Create a trigger using the appropriate factory function
5. Register it in `src/index.ts`

```ts
// src/index.ts
import { myNewTrigger } from "scripts/myService/myScript";

await registerTriggers({
    triggers: [authentikLoginFailed, myNewTrigger],
});
```