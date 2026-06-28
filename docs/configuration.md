# Configuration

## Environment Variables

Copy `.env` to configure the project.

| Variable | Description | Default |
|----------|-------------|---------|
| `MQTT_DEFAULT_BROKER_URL` | MQTT broker URL | `mqtt://192.168.0.3:1883` |
| `MQTT_DEFAULT_BROKER_USERNAME` | MQTT username | — |
| `MQTT_DEFAULT_BROKER_PASSWORD` | MQTT password | — |
| `MONGO_LOGS` | MongoDB connection string (for instrumentation) | — |
| `HA_DEFAULT_URL` | Home Assistant URL | `wss://home.local.gui.dev.br` |
| `HA_DEFAULT_TOKEN` | Home Assistant Long-Lived Access Token | — |
| `DISCORD_DEFAULT_PUBLIC_KEY` | Discord Bot Token | — |
| `REDIS_DEFAULT_URL` | Redis URL | `none` |
| `EMAIL_DEFAULT_USER` | IMAP email user | `none` |
| `EMAIL_DEFAULT_PASSWORD` | IMAP email password | `none` |
| `EMAIL_DEFAULT_HOST` | IMAP host | `none` |
| `EMAIL_DEFAULT_PORT` | IMAP port | `none` |
| `EMAIL_DEFAULT_TLS` | Use TLS for IMAP | `false` |
| `POSTGRES_DEFAULT_URL` | PostgreSQL connection string | `none` |
| `PORT` | HTTP server port (Elysia) | `3000` |

## CLI Arguments

```bash
bun run src/index.ts [options]
```

| Option | Description |
|--------|-------------|
| `--only-run=<id>` | Only register a specific trigger by ID (repeatable) |
| `--debug` | Enable debug console output |