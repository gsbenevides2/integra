# Voice assistant ("Ei Integra")

An AI voice assistant that speaks and understands Brazilian Portuguese. It
answers questions about the house and the services Integra monitors, and it
can control Tuya devices. It is built for the always-on tablet kiosk, but works
in any browser.

Everything except the wake word goes through OpenRouter with the single
`OPEN_ROUTER_API_KEY`: the agent's LLM, ElevenLabs speech-to-text and image
generation. Text to speech uses ElevenLabs' own API when `ELEVENLABS_API_KEY`
and `ELEVENLABS_VOICE_ID` are set, and Microsoft MAI through OpenRouter
otherwise.

## Flow

```text
[Vosk (WASM, offline)] --"ei integra"--> [record until silence (browser VAD)]
        ^                                        | WAV
        |                                        v
        |                     POST /api/assistant/stt   -> OpenRouter elevenlabs/scribe-v2
        |                     POST /api/assistant/chat/stream (SSE) -> agent + tools, as the user
        |                                        |
        +-- back to wake word <-- Web Audio <-- POST /api/assistant/tts -> ElevenLabs (pt-BR voice)
                                                                            or microsoft/mai-voice-2.1-flash
```

### Wake word

- Vosk runs offline in a Web Worker, using the
  [`@lichess-org/vosk-browser`](https://github.com/lichess-org/vosk-browser)
  fork. The original `vosk-browser` has had no release since 2022; Lichess
  maintains this fork and uses it for voice moves.
- The implementation is in `public/components/VoiceAssistantContext/wakeWord.ts`.
- The recognizer's grammar is limited to `WAKE_PHRASES`, so anything else
  becomes `[unk]`. To change the phrase, edit that list; no training is needed.
- Only a **final** result that is **exactly** a wake phrase counts. Partial
  results, or results mixed with `[unk]`, fired on ordinary speech in tests
  ("bom dia…", "a integração…").
- `hey` is not in the Portuguese vocabulary. A spoken "hey integra" is
  recognised as "ei integra".
- The wake word starts a session when the assistant is idle, and
  **interrupts a reply being spoken** (barge-in). Echo cancellation keeps the
  assistant's own voice out, and only an utterance that is exactly the wake
  phrase counts. While listening or thinking it is ignored.

### Recording and speech to text

- `transcriber.ts` records from the microphone (`microphone.ts`, an
  AudioWorklet).
- The wake word and the transcriber **share one microphone**: it opens on
  first use and closes when the last listener stops. Opening a second one for
  every utterance lost the first syllables said right after the chime.
- It ends the utterance after 1.2 s of silence, using an energy-based VAD
  (`VAD` constants).
- The audio is encoded as a 16 kHz WAV (`wav.ts`) and sent to
  `POST /api/assistant/stt`.

### Agent

- `@openrouter/agent`'s `callModel` in `server/modules/assistant/service/agent.ts`,
  with up to 6 steps and minimal reasoning, for latency.
- History is kept in memory per user for 10 minutes (`service/conversation.ts`).

### Streaming replies (SSE)

The browser talks to `POST /api/assistant/chat/stream`, which answers with
Server-Sent Events. There is one `data:` JSON frame per `StreamEvent`
(`model.ts`), in this order:

1. `conversation`: the conversation id.
2. `tool` and `action`: each tool as it starts, then its outcome.
3. `image`: a generated image or camera snapshot as soon as it is saved.
4. `delta`: the reply text, piece by piece.
5. `done`: the final reply, which replaces the streamed text. If something
   fails, an `error` event comes instead.

`EventSource` only does GET, so `VoiceAssistantContext/chatStream.ts` reads
the stream from `fetch`. The response sends `x-accel-buffering: no` so
nginx-style proxies do not hold it back. `POST /api/assistant/chat` is the
same agent without streaming.

In the chat:

- **Before the first words:** the reply bubble shows three pulsing dots
  (`TypingDots`). The orb shows the same dots while thinking, instead of the
  microphone.
- **Tools:** a running tool shows its progress, for example "Olhando a
  câmera…" (`toolLabels.ts`). Image generation shows an animated "Gerando
  imagem…" placeholder until the image arrives.
- **Text:** live replies are typed in at a steady pace
  (`TypedText.tsx`, ~50 characters per second, faster when far behind).
  Showing the deltas as they arrive would look like the text popping in: a
  short reply is generated in about half a second, often several deltas per
  network packet. Conversations opened from the history show complete
  instantly, and so does a reply already typed once (`markTyped`), so leaving
  and coming back to the dashboard does not type everything again.
- **Rendering:** messages are memoized and the chat follows new text at most
  once per frame, so only the reply being typed re-renders.
- **Markdown:** assistant replies render as markdown (`MessageMarkdown.tsx`:
  `react-markdown` with `remark-gfm`, compact Tailwind styles).
  - Raw HTML is never rendered.
  - Markdown images are dropped, because a URL written by the model could load
    anything. The conversation's own images come from the bucket.
  - User messages stay plain text.
  - The prompt allows light markdown: bold and short lists.
- **Voice:** it is still synthesised from the final text, once the reply is
  complete. Before speaking, `service/speakable.ts` turns the markdown into
  plain sentences:
  - list items and table rows become sentences, with pauses;
  - links keep only their text, and bare URLs and code blocks are dropped;
  - emphasis markers are removed.

### Text to speech

- **ElevenLabs (preferred):** with `ELEVENLABS_API_KEY` and
  `ELEVENLABS_VOICE_ID` set, replies are spoken through ElevenLabs' own API
  (`POST /v1/text-to-speech/{voice}/stream`, mp3 44.1 kHz/128 kbps), not
  OpenRouter's. That reaches the Voice Library's native **Brazilian** voices,
  which OpenRouter's ElevenLabs (English voices only) cannot.
  - The model is `eleven_multilingual_v2` (most natural; it detects the
    language itself, and the API documents `language_code` as unsupported
    for it). Set
    `ELEVENLABS_TTS_MODEL=eleven_flash_v2_5` for faster replies; models other
    than multilingual_v2 are sent `language_code: "pt"`.
  - The whole reply is synthesised before it plays, so total generation time is
    what counts: ~1.8 s for a 4 s sentence with multilingual_v2.
  - Pick a voice with `bun run assistant:voices` (Brazilian voices of the
    Voice Library and the account's voices, with previews), add a library voice
    with `bun run assistant:voices -- add <public_owner_id> <voice_id>`, and set
    `ELEVENLABS_VOICE_ID`. The key needs `voices_read`/`voices_write` for that
    script; speaking only needs text to speech.
  - The voice's stability, similarity and style come from its settings on
    ElevenLabs; tune them there.
- **OpenRouter (fallback):** without ElevenLabs configured, it is
  `microsoft/mai-voice-2.1-flash` with the voice
  `pt-BR-Luana:MAI-Voice-2.1-Flash` (`service/audio.ts`). Change them with
  `ASSISTANT_TTS_MODEL` and `ASSISTANT_VOICE`. An `instructions` hint asking
  for a Brazilian accent is always sent; models that support it (OpenAI,
  Gemini) follow it, and the rest ignore it.
- The server proxies the mp3 from `POST /api/assistant/tts`, for the web and
  the Android app alike.
- The browser plays it through the **Web Audio API** (`speaker.ts`), not an
  `<audio>` element. With the microphone open, browsers (notably Chrome on
  Android) pause media elements as they start ("The play() request was
  interrupted by a call to pause()").

### Follow-ups and ending

- After a reply, the assistant listens for 6 more seconds without needing the
  wake word.
- Saying goodbye ("obrigado, tchau", "valeu, era só isso", "pode parar") ends
  the session right after the farewell is spoken. The conversation history is
  cleared on both sides.
- The model ends it by calling the `encerrar_conversa` tool. A deterministic
  backstop, `service/farewell.ts`, also ends it when the utterance is made only
  of goodbyes and fillers ("ok, tchau", "valeu, era só isso"), in case the
  model forgets the tool. It never fires on a question, on anything with a
  request in it ("valeu, apaga a luz", "fui no mercado"), or when a tool ran
  in that turn.

### Failures

- If a reply fails, the error stays in the chat with a **"Tentar de novo"**
  button that sends the same text and images again (plus a toast, which is
  what shows over other dashboards).
- If only the speech fails, the reply stays on screen and the assistant keeps
  listening for a follow-up.

### Where it shows

- The provider (`VoiceAssistantContext`) wraps the whole app, so the wake word
  works on every dashboard.
- On a dashboard other than "Assistente", a floating overlay
  (`VoiceAssistantOverlay`) shows the assistant's state instead of navigating
  away.

## Tools

Each tool lives in `server/modules/assistant/tools/` and is built with
`guardedTool` (`tools/guard.ts`).

Tools call services directly, which skips the HTTP route guard. So every tool
re-checks the **route grants of its equivalent route**, plus the **resource
grants** where that route has resource rules. A user can only do by voice what
they could do in the UI.

| Tool | Equivalent route(s) | Extra checks |
|---|---|---|
| `listar_dispositivos` | `GET /api/tuya/devices` | readable `tuya_device` |
| `controlar_dispositivo`, `controlar_varios_dispositivos` | + `POST /api/tuya/devices/:id/command` | `tuya_device` write |
| `listar_cenas` | `GET /api/tuya/presets` | readable `tuya_preset` |
| `aplicar_cena` | + `POST /api/tuya/presets/:id/apply` | `tuya_preset` apply, `tuya_device` write |
| `ler_sensores` | `GET /api/tuya/sensors` | readable `tuya_sensor` |
| `status_servidor` | `GET /api/server-metrics/latest`, `…/speedtest/latest` | |
| `status_plataformas` | `GET /api/status-platform/list` | |
| `status_linhas_trem` | `GET /api/train-status/lines` | |
| `status_roteador` | `GET /api/tplink/settings/latest-router-status` | |
| `dispositivos_conectados` | `GET /api/tplink/checks/latest` | |
| `agenda` | `GET /api/google/accounts` (there is no calendar route) | |
| `listar_rotinas`, `executar_rotina` | `GET /api/crons/list`, `POST /api/crons/run/:jobName` | `cron_job` execute |
| `listar_cameras`, `ver_camera` | `GET /api/frigate/cameras` | readable `frigate_camera` |
| `gerar_imagem` | none (runs inside an allowed chat) | |
| `encerrar_conversa` | none (only ends the voice session) | |

Restarting the router's network is deliberately **not** exposed: it is too
disruptive to trigger by a misheard sentence.

To add a tool, write a `guardedTool` in the matching file under `tools/` and
list the route keys it mirrors. Give it a short pt-BR `summarize`; the summary
becomes the action chip shown in the UI.

## Conversation history

Conversations are stored per user in `assistant.conversations` and
`assistant.messages` (`service/conversation.ts`). They are kept until the user
deletes them.

- **Resuming:** a message without a `conversationId` resumes the user's latest
  open conversation if it was active in the last 10 minutes; otherwise a new
  one starts. A new conversation is only saved together with its first turn
  (in one transaction), so a failed first message leaves no empty conversation
  behind. A goodbye closes the conversation, continuing a closed one reopens
  it, and "Nova conversa"
  (`DELETE /api/assistant/conversation`) closes it without deleting anything.
- **Browser side:** the browser keeps the current `conversationId` and drops it
  after 10 minutes idle, so the wake word does not resume an old conversation.
- **Context:** the model gets the last 12 messages.
- **History drawer** (clock button on the "Assistente" dashboard):
  - lists the conversations from `GET /api/assistant/conversations`;
  - opens one with `GET /api/assistant/conversations/:id` to read and continue
    it;
  - deletes one with `DELETE /api/assistant/conversations/:id`, which also
    removes its images from the bucket.

  Every route only ever sees the signed-in user's conversations.

## Images

All images live in the **private** S3 bucket (`S3_*`, via `Bun.s3`) under
`assistant/<userId>/<source>/` (`service/images.ts`):

- **Browser:** loads images from `GET /api/assistant/images/*` (owner only),
  which redirects to a presigned URL valid for 10 minutes. The page's URLs
  never expire, so a kiosk left open for hours keeps showing its images.
- **Cleanup:** the daily `assistant.images.sweep` cron deletes objects older
  than a day that no message refers to: uploads never sent, images of a turn
  that failed to save, or images left behind when a conversation delete could
  not reach the bucket.
- **Model:** gets the bytes inlined as data URLs, so the bucket never has to be
  reachable by the model provider.
- **Ownership:** a key sent by a client must start with the user's own prefix,
  otherwise `/chat` answers 403.

Images enter a conversation in three ways:

- **Uploads:** the photo button on the dashboard.
  - The browser downscales the photo to 1600 px JPEG
    (`VoiceAssistantContext/imageUpload.ts`) and sends it raw to
    `POST /api/assistant/uploads`.
  - The image is then attached to the next message, typed **or spoken**. For
    example, attach a photo, then say "Ei Integra, o que é isso?".
  - The images the user sent in the 3 most recent message slots are inlined
    for the model.
- **Cameras:** `ver_camera` takes Frigate's latest frame
  (`/api/<camera>/latest.jpg?h=720`), saves it, and returns it to the model as
  an `input_image` through the tool's `toModelOutput`. The model actually sees
  the scene. The photo is also shown in the reply and kept in history.
- **Generation:** `gerar_imagem` calls OpenRouter's Image API
  (`service/imageGeneration.ts`, model `ASSISTANT_IMAGE_MODEL`, default
    `google/gemini-3-pro-image`). It takes ~30 s per image, so the assistant
    stays "thinking" meanwhile.
  - With `editar_imagem_anterior`, the latest image of the conversation (sent,
    generated or from a camera) is passed as a reference.
  - A request like "deixa mais azul" therefore edits instead of starting over.

Images from replies show as thumbnails in the conversation. While the
assistant speaks over another dashboard, the overlay shows the reply's image.

## Personal instructions

Each user can give the assistant their own instructions, such as a nickname,
tone or room names. Use the gear button ("Minhas preferências") on the
"Assistente" dashboard.

- **Scope:** instructions are **per user**. They are added to the system prompt
  only when that user talks to the assistant, and other users never see or get
  them.
- **Who sees the button:** holders of the `PUT /api/assistant/settings` route
  grant. Both settings routes always act on the signed-in user, so this grant
  only lets someone edit their own instructions.
- **Storage:** the text is kept in `assistant.user_settings`, one row per user,
  up to 4000 characters. It is appended after the built-in rules, and takes
  effect from the next message.
- **If the table is missing:** chat keeps working without the instructions,
  and a warning is logged.

## Setup

1. **Database:** run `bun run db:sync` to create the `assistant` schema
   (`assistant.user_settings`, `assistant.conversations`, `assistant.messages`).
2. **Wake word model:** run `bun run assistant:model`. It downloads
   `vosk-model-small-pt-0.3` (~32 MB, Apache 2.0) and repackages it as
   `public/vosk/vosk-model-small-pt.tar.gz`.
   - The model is gitignored.
   - The Docker build runs the same script.
   - The browser downloads it once and keeps it in IndexedDB.
   - Without it, `GET /api/assistant/config` reports the wake word as off, and
     the assistant still works from the microphone button.
3. **Permissions:** grant users the `/api/assistant/*` routes in the
   Permissions dashboard.
   - `POST /api/assistant/chat` enables the assistant in the UI.
   - Voice also needs config, STT, TTS and conversation reset.
   - `GET`/`PUT /api/assistant/settings` let users edit their own instructions.
   - History needs `GET /api/assistant/conversations`, `GET` and `DELETE`
     `/api/assistant/conversations/:id`. Photos need `POST /api/assistant/uploads`.
   - **Any image** in the chat (uploads, generated, cameras) needs
     `GET /api/assistant/images/*`.
   - Cameras follow the user's existing Frigate grants
     (`GET /api/frigate/cameras` and per-camera read).

## Kiosk notes

- The microphone needs a **secure context**: HTTPS, or `localhost`.
- Browsers keep audio suspended until the first tap. Tap the screen once after
  loading, or start Chromium with `--autoplay-policy=no-user-gesture-required`.
- While the wake word is on, the page holds a screen Wake Lock so the tablet
  does not sleep.
- Vosk runs continuously while the wake word is on. On a tablet that is always
  on, keep an eye on battery and heat.
