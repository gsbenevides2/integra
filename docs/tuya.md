# Tuya

Integration for Tuya / Smart Life devices: lamps, relay switches, and battery sensors (temperature/humidity, door contact, motion).

**This is entirely cloud-based.** Unlike the old repo, there is no from-scratch local LAN protocol implementation, no UDP discovery, and no `localKey` stored or encrypted anywhere. Everything goes through Tuya's official cloud API (`@tuya/tuya-connector-nodejs`) plus a real-time push websocket (**Pulsar**) — no polling loop for device/sensor state exists.

## Setup

Two environment variables (see [`configuration.md`](./configuration.md) for the full reference):

| Variable | Purpose |
|----------|---------|
| `TUYA_ACCESS_ID` / `TUYA_ACCESS_SECRET` | Access ID/Secret of the Tuya IoT Platform cloud project |
| `TUYA_DATA_CENTER` | `us`, `eu`, `cn` or `in` — defaults to `us` |
| `TUYA_PULSAR_ENV` | `test` selects Tuya's Pulsar test environment; anything else is prod |

**Devices and sensors are registered by hand** — there is no catalogue sync or discovery step. `POST /api/tuya/devices` (or the "new device" form on the dashboard) with the device's Tuya `deviceId` pasted in is the only way one gets added. Once registered, Pulsar starts reporting its state automatically.

## HTTP API

All routes are under `/api/tuya` (`server/modules/tuya/index.ts`):

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/devices?includeHidden=true` | Lamps/switches with their latest known state |
| POST | `/devices` | Register a device by its Tuya `deviceId` |
| PUT / DELETE | `/devices/:id` | Update / remove |
| GET | `/devices/:id/state` | Live read straight from the cloud (falls back to offline state on error) |
| POST | `/devices/:id/command` | `{ power?, brightness?, colorTemp?, colorHex?, workMode?, channels? }` |
| GET | `/devices/:id/history?before=` | State history, cursor-paginated |
| GET / POST | `/presets` | Saved lamp looks (power/brightness/colour/mode), reusable across devices |
| PUT / DELETE | `/presets/:id` | Update / remove a preset |
| POST | `/presets/:id/apply` | Applies a saved preset to a device (`{ deviceId }`) |
| GET | `/sensors?includeHidden=true` | Sensors with their latest readings |
| POST | `/sensors` | Register a sensor by its Tuya `deviceId` |
| PUT / DELETE | `/sensors/:id` | Rename/enable/hide / remove |
| GET | `/sensors/:id/history?code=&before=` | Reading history, optionally filtered by data-point code |

## Normalization

Brightness and colour temperature are always **0–100 percent** in this app's API, never the device's raw range — the raw range differs by firmware generation (`bright_value`/`temp_value`, 0–255, older bulbs; `bright_value_v2`/`temp_value_v2`, 0–1000, newer ones) and is detected per-device from which codes it actually reports (`detectCloudCodes` in `service/cloud/deviceState.ts`). Colour is always a `#rrggbb` hex string, converted to/from Tuya's HSV `colour_data`/`colour_data_v2` object.

A relay switch is a `Record<channel, boolean>` (`switch_1`–`switch_6` in Tuya's own codes), not a single power boolean — a single-gang switch is just channel `"1"`.

## Reacting to a change from other code

There's no trigger-factory equivalent to the old repo's `onTuyaSensorChange`/`onTuyaDeviceChange` — see [`triggers.md`](./triggers.md) for the plain `tuyaEvents` event bus that replaced them (`server/modules/tuya/events.ts`).

## How it works

### Pulsar (real-time push)

`startTuyaPulsar()` opens one websocket connection for the whole process lifetime (`server/modules/tuya/service/pulsar/`). Every message is either an online/offline `bizCode` or a `status` array of changed data points, routed to `handleDeviceReport` or `handleSensorReport`.

Pulsar only reports **the data points that changed**, not a full snapshot — feeding a one-field delta straight to `cloudStatusToDeviceState` would wipe every other field back to `null`, since that function was written for the cloud's full-status REST response. The handler keeps an in-process `Map` of the fullest status seen per device, seeded once from the cloud on first sight, and merges every incoming delta onto it before translating.

### Cloud API quirks — `service/cloud/client.ts`

Two of `@tuya/tuya-connector-nodejs@2.1.2`'s typed helpers don't actually work and are deliberately bypassed in favor of the generic `request()`:

- `tuya.deviceStatus.statusList` serializes `device_ids` as `device_ids[0]=...`, which the endpoint doesn't understand — a hand-built comma-joined query string is used instead. One call still covers every device, keeping calls well inside rate limits.
- `tuya.deviceFunction.command` issues a bodiless `GET` instead of a `POST` with `{ commands }` — every call would otherwise silently "succeed" while doing nothing (`[1108] uri path invalid`, unwrapped because the SDK doesn't reject non-`success` responses).

Every cloud call goes through a shared `unwrap()` that throws on `{ success: false }`, since the SDK hands that back as an ordinary value otherwise.

### Reading back after a command

Tuya's status shadow trails a command by a second or two. Reading it back immediately after sending a command would show the *previous* value and make the UI snap backwards, so `DeviceService.command()` returns the state it just computed from the command instead of re-reading the cloud — Pulsar reconciles against the device's own report shortly after either way.

### History

`StateService.saveStateIfChanged` only inserts a row when the state actually differs from the last one recorded — Pulsar can report the same value more than once. Sensor readings are deduplicated the same way per data-point code. A daily cron (`tuya.history.prune`, `server/cron.ts`) deletes state history older than 30 days and sensor readings older than 90 days; there's no discovery/reconnect job to run since nothing is polled.

## What changed from the old repo

| Old repo | This repo |
|---|---|
| Local LAN protocol (versions 3.1–3.5), UDP discovery, `localKey` encrypted at rest | Gone entirely — cloud API + Pulsar only |
| Catalogue sync (`POST /catalogue/sync`) auto-imports devices from the Tuya account | Devices/sensors registered one at a time by pasting a `deviceId` |
| `tuya-sensor-readings`/`tuya-sync`/`tuya-discovery` cron jobs (poll every 1–5 min) | Real-time via Pulsar; only a daily history-prune cron remains |
| `onTuyaSensorChange`/`onTuyaDeviceChange` trigger factories, `--test=<id>` | `tuyaEvents` event bus (`onDeviceChange`/`onSensorChange`) |
