# Motiva Trilhos API (research notes)

Reverse-engineered routes from the **Motiva Trilhos** Android app (`br.com.grupoccr.viamobilidade`,
v2.13.6), mapped by TLS interception on 2026-10-31 and re-verified standalone with `curl`. The
next-train route is used by [`server/modules/motiva-trilhos`](../server/modules/motiva-trilhos) for a
fixed personal commute (Luz↔Pinheiros on line 4-Amarela, Pinheiros↔Morumbi on line 9-Esmeralda); the
rest are kept here for reference only.

## Host and authentication

```
https://apim-appsitemobilidade-prd-brazilsouth-001.azure-api.net
```

Every route requires this header:

```
apim-api-key: 8b197e2fd3ed4508b8f0bbb695d9b08f
```

Without it, 401:

```json
{ "statusCode": 401, "message": "Access denied due to missing subscription key. Make sure to include subscription key when making requests to an API." }
```

The key is the one embedded in the app itself (no personal account involved — none of the routes
below needed a login). Use sparingly; it is not ours.

## Routes

All tested with `UF=SP`, `lineId=CCRVM8e9-L8` (Linha 8-Diamante), `lat=-23.6354071&lng=-46.3196897`,
`C=VM&T=8&S=DMO` (Domingos de Moraes station). All returned HTTP 200.

### `GET /app/ccr/v1/home/alert?state={UF}`
General home alert (strikes, service disruptions). Empty right now: `{}`.

### `GET /app/ccr/v1/home/slots?state={UF}`
Home screen content: shortcuts ("Next train", "Bike parking", "Help center", "Transit map") and a
banner/news carousel.

### `GET /app/ccr/v1/lines/concessions?state={UF}`
Concessions and their lines, with fare info.
```json
{"concessions":[
  {"id":"CCRVQ","name":"Motiva Linha Quatro","lines":[{"id":"CCRVQ-L4","number":4,"name":"Amarela","tariff":{"value":"R$ 5,40 - valor unitário*"}}]},
  {"id":"CCRVM8e9","name":"ViaMobilidade 8 e 9","lines":[{"id":"CCRVM8e9-L8","number":8,"name":"Diamante"},{"id":"CCRVM8e9-L9","number":9,"name":"Esmeralda"}]}
]}
```

### `GET /app/ccr/v1/lines/status/{UF}`
Per-line operational status for every concession in the state (not just CCR's own) — same data as the
public `webapi.grupoccr.com.br/v1/mobility/public/line-status/current/state/{UF}` endpoint already
used by [`fetchers/ccr.ts`](../server/modules/train-status/service/fetchers/ccr.ts).

### `GET /app/ccr/v1/lines/ccr-line/{lineId}`
Detail of a line actually operated by CCR (only `CCRVQ-L4`, `CCRVM5e17-L5`, `CCRVM8e9-L8`,
`CCRVM8e9-L9` — Metrô/CPTM/etc. have no detail here). Returns ordered stations with `latlong`,
connections to other lines, and each station's `nextTrainCode`.
```json
{"id":"CCRVM8e9-L8","name":"Diamante","number":8,"stations":[
  {"id":"CCRVM8e9-L8-4","name":"Domingos de Moraes","latlong":"-23.518640,-46.721230","nextTrainCode":"VM-8-DMO-1|VM-8-DMO-2","direction":"BOTH","connections":[]}
]}
```
`nextTrainCode` is `{concessionaire}-{track}-{stationCode}-{platform}`, the two platforms
(directions) separated by `|`. This is where `concessionaire`/`track`/`stationCode` for the next-train
route below come from.

### `GET /app/ccr/v1/stations?state={UF}`
Every station in the state, across all concessions (not just CCR), each with a `nextTrainCode` but no
coordinate — for coordinates go through `lines/ccr-line/{lineId}` above.

### `GET /app/ccr/v1/location/state?lat={lat}&lng={lng}`
Resolves a coordinate to a state (`{"state":"SP"}`) — used by the app to pick `state` for the routes
above.

### `GET /int/ccr/next-train/concessionaire/{concessionaire}/track/{track}/departure/{station}`
The useful one: next train at a station, both directions at once.
```json
{"Status":true,"Message":"Consulta do próximo trem realizada com sucesso.","Data":[
  {"concessionaire":"VM","track":"8","station":"DMO","direction":"Amador Bueno","platform":"1","expectedArrivalTime":"2026-10-31T00:22:45.603-03:00"},
  {"concessionaire":"VM","track":"8","station":"DMO","direction":"Julio Prestes","platform":"2","expectedArrivalTime":"2026-10-31T00:26:11.604-03:00"}
]}
```

## Not tested
Seen only as strings in the app's JS bundle, never triggered during navigation — likely require an
Azure B2C login: `/v1/card/recharge-order`, `/v1/card/status-order`, `/v1/card/validate`,
`/v1/notifications/*`, `/v1/ombudsman/*`.

## How this was obtained
The APK has OkHttp certificate pinning, so a plain mitmproxy capture only sees TLS handshakes. Route:
`apk-mitm` (Apktool 3.0.3) to strip the pinning and allow user-installed CAs — Apktool's rebuild
corrupts `res/drawable/rn_edit_text_material.xml` when it contains `android:drawable="@null"` inside a
`<selector>` (any screen with a text field then crashes on launch), fixed by replacing `@null` with
`@android:color/transparent` before rebuilding — then `mitmproxy` on the Mac with the phone's Wi-Fi
proxy pointed at it, decrypting live traffic while using the app normally.
