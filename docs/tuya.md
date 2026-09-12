# Tuya

Integration for Tuya / Smart Life devices: light bulbs, Wi-Fi relay modules, and battery
sensors (temperature, door contact, motion).

Two transports are used, and which one applies is decided per device rather than configured:

| Transport      | Used for                                                | Why                                                                                                      |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Local LAN**  | Bulbs and relay modules                                 | Instantaneous, works with the internet down, and the device pushes state changes instead of being polled |
| **Tuya Cloud** | Battery sensors, and as a fallback for bulbs and relays | Battery sensors sleep and do not serve TCP; the cloud is the only way to reach them                      |

The Tuya account is always the source of truth for _what exists_. LAN discovery only
supplies a device's address and protocol version.

---

## Setup

Three environment variables:

| Variable                | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `TUYA_ACCESS_ID`        | Access ID of the Tuya IoT Platform cloud project                                    |
| `TUYA_ACCESS_SECRET`    | Access Secret of the same project                                                   |
| `TUYA_DATA_CENTER`      | `us`, `eu`, `cn` or `in` — defaults to `us`                                         |
| `TUYA_LOCAL_KEY_SECRET` | Any long string; derives the AES key that encrypts each device's `localKey` at rest |

To obtain the first three: create a project at [iot.tuya.com](https://iot.tuya.com)
(_Cloud → Development → Create Cloud Project_, industry _Smart Home_), then link the Smart
Life app account under _Devices → Link Tuya App Account_ by scanning the QR code from the
app (_Me → scan icon_). The data centre must match the one the project was created in.

Then run `bun run db:sync` and hit **Sincronizar** on the Casa dashboard, or:

```
curl -X POST http://localhost:3000/tuya/catalogue/sync
```

Devices and sensors appear automatically. Nothing has to be entered by hand — the `localKey`
of each bulb and relay is read from the cloud and refreshed on every catalogue sync, which is
what makes a re-paired device heal itself instead of failing its handshake indefinitely.

---

## Writing automations

### Reacting to a sensor

```ts
import { onTuyaSensorChange } from "core/triggers/tuya";
import { turnOn } from "utils/tuya";

export const motionLightsUp = onTuyaSensorChange(
    { id: "motion-lights-up", kind: "motion", code: "pir_state", value: "pir" },
    async (event, traceId) => {
        await turnOn("Quarto do Gui", traceId);
    },
);
```

Register it in the `triggers` array in `src/index.ts`, exactly like a cron.

`onTuyaSensorChange(settings, handler)` — fires when a sensor data point **changes value**.
All filters are optional and may be a single value or an array; omitting one matches everything.

| Setting  | Meaning                                                                  |
| -------- | ------------------------------------------------------------------------ |
| `id`     | Trigger id, as with any other trigger                                    |
| `sensor` | Friendly name, Tuya device id, or internal id                            |
| `code`   | Data point code, e.g. `pir_state`, `doorcontact_state`, `va_temperature` |
| `kind`   | `temperature_humidity`, `door`, `motion`, `unknown`                      |
| `value`  | Fire only when the **new** value is one of these                         |

The handler receives `(event, traceId)`:

```ts
interface SensorChangeEvent {
    sensor: Sensor;
    code: string;
    value: string; // always a string; convert as needed
    previousValue: string | null;
    at: Date; // the device's own timestamp, not collection time
}
```

`previousValue` is what makes edge detection possible. Filtering on `value: "pir"` fires only
when motion starts; without it the handler also runs when the sensor clears.

### Reacting to a lamp or switch

```ts
import { onTuyaDeviceChange } from "core/triggers/tuya";

export const lampLog = onTuyaDeviceChange(
    { id: "lamp-log", kind: "lamp", field: ["power", "brightness"] },
    async (event, traceId) => {
        /* ... */
    },
);
```

| Setting  | Meaning                                                                          |
| -------- | -------------------------------------------------------------------------------- |
| `device` | Friendly name, Tuya device id, or internal id                                    |
| `kind`   | `lamp` or `switch`                                                               |
| `field`  | `online`, `power`, `brightness`, `colorTemp`, `colorHex`, `workMode`, `channels` |

```ts
interface DeviceChangeEvent {
    device: Device;
    previous: DeviceState | null;
    current: DeviceState;
    changed: DeviceField[]; // empty on the first ever reading
    at: Date;
}
```

These fire for changes made **anywhere** — the Integra dashboard, the Smart Life app, or a
physical wall switch — because a connected bulb pushes its state over the LAN.

### Testing an automation

Both triggers implement `test()`, which replays the current value of everything that matches:

```
bun run src/index.ts --test=motion-lights-up
```

That runs the handler without waiting for somebody to walk past a sensor.

---

## Script API — `utils/tuya`

Everything resolves devices and sensors by **friendly name** (case-insensitive), Tuya device
id, or internal id.

### Control

```ts
import {
    turnOn,
    turnOff,
    toggle,
    setBrightness,
    setColor,
    setColorTemp,
    setChannel,
} from "utils/tuya";

await turnOn("Quarto do Gui");
await setBrightness("Quarto do Gui", 40); // percent, 0-100
await setColor("Quarto do Gui", "#ff0000"); // switches to colour mode automatically
await setColorTemp("Quarto do Gui", 100); // percent, 0 warmest to 100 coolest
await setChannel("Ventilador", 2, true); // relay channel, numbered from 1
await setChannels("Ventilador", { "1": true, "2": false });
await setWorkMode("Quarto do Gui", "white"); // white | colour | scene | music
```

Each returns `{ state, transport }`, where `transport` is `"local"` or `"cloud"` — useful when
a script wants to know whether the LAN path was available.

Brightness and colour temperature are always percentages. The raw ranges differ per bulb
generation (10–1000 on newer bulbs, 25–255 on older ones) and are normalised away.

### Reading

```ts
import {
    getDevices,
    getDeviceState,
    isOn,
    getDeviceHistory,
    getSensors,
    getSensorReadings,
    getSensorValue,
    getSensorHistory,
    getTemperature,
    getHumidity,
    isDoorOpen,
    isMotionDetected,
} from "utils/tuya";

await getTemperature("Humidade E Temperatura"); // 21.7 — already divided by 10
await getHumidity("Humidade E Temperatura"); // 89
await isDoorOpen("Porta do Quarto do Gui"); // true | false | null
await isMotionDetected("Sensor de Movimento"); // true | false | null
await getSensorValue("Sensor 2", "battery_percentage"); // "97" — raw string
```

`null` means the data point has never been seen, which is different from `false`.

Every function takes an optional final `traceId`. Pass the one your handler received so the
call shows up inside the same run in the Execution Logs dashboard; omit it and the call is
not traced.

---

## Data points by device type

Tuya reports data points by numeric index over the LAN and by code over the cloud. These are
the ones this integration understands.

### Bulbs

Three index layouts exist. The bulb's layout is detected once, on first connection, from the
data points it reports.

| Layout | Switch | Mode | Brightness | Colour temp | Colour | Brightness range |
| ------ | ------ | ---- | ---------- | ----------- | ------ | ---------------- |
| A      | 1      | 2    | 3          | 4           | 5      | 25–255           |
| B      | 20     | 21   | 22         | 23          | 24     | 10–1000          |
| C      | 1      | —    | 2          | 3           | —      | 25–255           |

Cloud codes are `switch_led`, `work_mode`, `bright_value[_v2]`, `temp_value[_v2]`,
`colour_data[_v2]`. Colour is a packed hex string over the LAN and a JSON object in the cloud.

### Relay modules

One boolean per channel: index `1`–`6` locally, `switch_1`–`switch_6` in the cloud. The
channel count is read from the device during catalogue sync.

### Sensors

| Kind                   | Codes                                                           |
| ---------------------- | --------------------------------------------------------------- |
| Temperature / humidity | `va_temperature` (tenths of °C), `va_humidity`, `battery_state` |
| Door contact           | `doorcontact_state`, `battery_percentage`, `temper_alarm`       |
| Motion                 | `pir_state` (`pir` / `none`), `battery_state`                   |

Motion sensors report through Tuya's **thing model** (custom data point ids 101+), not the
standard instruction set, so `/v1.0/devices/{id}/status` returns nothing for them. They are
read from `/v2.0/cloud/thing/{id}/shadow/properties` instead.

---

## HTTP API

All routes are under `/tuya`, registered as `onHttp({ id: "tuya-routes", dontTrace: true })`.

| Method | Route                                | Purpose                                                                |
| ------ | ------------------------------------ | ---------------------------------------------------------------------- |
| GET    | `/devices?includeHidden=true`        | Lamps and switches with their last known state                         |
| POST   | `/devices`                           | Register manually (rarely needed; the catalogue sync does this)        |
| PUT    | `/devices/:id`                       | Rename, set IP, replace `localKey`, hide, enable                       |
| DELETE | `/devices/:id`                       | Remove                                                                 |
| GET    | `/devices/:id/state`                 | Live read — LAN first, cloud fallback                                  |
| POST   | `/devices/:id/command`               | `{ power?, brightness?, colorTemp?, colorHex?, workMode?, channels? }` |
| POST   | `/devices/:id/probe`                 | Detect protocol version and bulb layout                                |
| GET    | `/devices/:id/history?before=`       | State history, cursor-paginated                                        |
| GET    | `/sensors?includeHidden=true`        | Sensors with their latest readings                                     |
| PUT    | `/sensors/:id`                       | Rename, hide, pause collection                                         |
| GET    | `/sensors/:id/history?code=&before=` | Reading history                                                        |
| POST   | `/catalogue/sync`                    | Re-read the account and import everything                              |
| GET    | `/discovered`                        | Devices seen on the LAN broadcast that are not registered              |

`localKey` is never returned by any route.

---

## Scheduled jobs

| Trigger id             | Schedule     | Does                                                                  |
| ---------------------- | ------------ | --------------------------------------------------------------------- |
| `tuya-catalogue`       | every 6 h    | Re-reads the account: new devices, renamed ones, refreshed local keys |
| `tuya-sensor-readings` | every minute | Pulls sensor changes from the cloud                                   |
| `tuya-sync`            | every minute | Reconnects dropped LAN sockets and reconciles device state            |
| `tuya-discovery`       | every 5 min  | UDP sweep for device IPs and protocol versions; prunes old readings   |

`bun run dev` starts with `--disableCrons`, so none of these run in development. Connections
are opened lazily on the first command, so the dashboard still works; to exercise a job once,
use `bun run src/index.ts --test=tuya-sync`.

---

## How it works

### Local protocol

Implemented from scratch in `src/utils/tuya/protocol/`, with no external dependency —
`node:crypto`, `node:zlib`, `node:net` and `node:dgram` from Bun cover it.

| Version | Frame | Encryption                            | Integrity   |
| ------- | ----- | ------------------------------------- | ----------- |
| 3.1     | 55AA  | AES-ECB + base64 on CONTROL only      | CRC32       |
| 3.3     | 55AA  | AES-ECB with the static local key     | CRC32       |
| 3.4     | 55AA  | AES-ECB with a negotiated session key | HMAC-SHA256 |
| 3.5     | 6699  | AES-GCM with a negotiated session key | GCM tag     |

Versions 3.4 and 3.5 negotiate a session key through a three-message handshake before any
command is accepted. Both have been verified against real hardware.

Two details that are easy to get wrong:

- Every device-to-client 6699 frame carries a 4-byte return code **inside** the ciphertext,
  including the binary handshake frames. Skipping it misaligns the nonce and the handshake
  fails with a misleading HMAC error.
- A pushed `STATUS` frame carries **only the data points that changed**, so it has to be
  merged onto the last full reading rather than interpreted alone.

### Addressing

A device is reached at the first address that answers, freshest lead first: the address it
was last heard broadcasting, then the one stored on the record. A broadcast is seconds old
while a stored address can be a lease the router moved on from days ago, so discovery leads —
but the stored address stays as a fallback, since the broadcast never reaches a host that
cannot see it.

Whatever finally answers is written back to the record, which is what makes a device that
changed address heal itself. When a socket opens but the device never answers — a firmware
upgrade moving it onto another protocol version looks exactly like this — the profile is
re-probed once and the read retried. Probing walks up to four protocol versions per address
with a five-second timeout each, so it is not repeated more than once every five minutes for
the same device.

A stored address that has failed three times running is forgotten, so the record stops
pinning the device to an address nothing answers at. That is only done while discovery is
demonstrably working on this host: when nothing at all is broadcasting, the stored address is
the only lead there is and dropping it would strand the device for good.

### Cloud requests

Signed with HMAC-SHA256. Query parameters must be sorted alphabetically in the signed string
or the API returns a bare `sign invalid`. POST bodies are hashed into the signature. Tokens
are cached in-process and refreshed a minute before expiry, with concurrent callers collapsed
onto a single refresh.

### History

A row is written only when the state actually changes.

For bulbs and relays, pushed changes are collapsed over a 10-second window before being
recorded: a bulb running a colour scene pushes several times a second, and without the
collapse the real events — turned on, dimmed, went offline — would be buried under thousands
of animation frames.

For sensors, the cloud event log is replayed from a cursor, which is what makes polling safe:
a door that opens and closes between two passes still lands in the history with the device's
own millisecond timestamp. Motion sensors have no event log available, so they are polled
every minute and each reading is stamped with the moment the device says it changed. A motion
pulse that starts and ends entirely between two polls is not observable — that is a limit of
polling, and lifting it needs Tuya's paid message service.

Readings older than 90 days are pruned. Anything already older than that on arrival is
discarded rather than stored, since it would be deleted moments later — and re-inserting it
every pass would re-announce it to every automation each time.

---

## Troubleshooting

**A bulb stops responding after being re-paired.** Its `localKey` changed. The catalogue sync
picks the new one up within 6 hours; to fix it immediately, hit **Sincronizar**.

**A device shows as offline but works in the Smart Life app.** The status shadow keeps its
last known values while a device is unplugged, so reachability comes from the device record
rather than the payload. Check the LAN: `--test=tuya-discovery` reports what is broadcasting.

**A sensor shows no readings at all.** Check whether the device reports anything in the Smart
Life app. Some vendors ship a product profile with no data points registered, in which case
there is nothing to read on any API.

**Discovery finds nothing in Docker.** UDP broadcast does not cross the bridge network. Run
the container with `network_mode: host`, or set each device's IP by hand. Without discovery a
hand-set address is the only lead there is, so a device that changes address is reachable
through the cloud but not over the LAN until the record is corrected — a DHCP reservation on
the router avoids the whole problem.

**Ports.** UDP 6666, 6667 and 7000 for discovery, TCP 6668 for control.
