/**
 * Picks the assistant's ElevenLabs voice (ELEVENLABS_VOICE_ID). Needs
 * ELEVENLABS_API_KEY in .env (Bun loads it), with the `voices_read` permission
 * to list and `voices_write` to add; the assistant itself only needs text to
 * speech, so a restricted key can skip this script and take a voice_id copied
 * from the ElevenLabs site.
 *
 *   bun run assistant:voices                     # Brazilian voices of the Voice Library, and yours
 *   bun run assistant:voices -- --search luana   # narrows the library search
 *   bun run assistant:voices -- add <public_owner_id> <voice_id> [name]
 *
 * Listen to the previews, add the chosen library voice to your account with
 * `add` (it then shows under "Your voices"), and set ELEVENLABS_VOICE_ID to
 * its voice_id. Voices already in your account can be used directly.
 */
const API_URL = "https://api.elevenlabs.io";
const LIBRARY_PAGE_SIZE = 30;

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("Set ELEVENLABS_API_KEY in .env first.");
  process.exit(1);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "xi-api-key": apiKey!, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

interface LibraryVoice {
  voice_id: string;
  public_owner_id: string;
  name: string;
  gender?: string;
  age?: string;
  accent?: string;
  locale?: string;
  use_case?: string;
  description?: string;
  preview_url?: string;
  is_added_by_user?: boolean;
}

interface AccountVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

function describe(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

async function listVoices(search?: string) {
  const query = new URLSearchParams({
    language: "pt",
    locale: "pt-BR",
    page_size: String(LIBRARY_PAGE_SIZE),
    sort: "usage_character_count_1y",
  });
  if (search) query.set("search", search);
  const library = await api<{ voices: LibraryVoice[] }>(`/v1/shared-voices?${query}`);
  console.log(`\nVoice Library, Brazilian Portuguese (most used first${search ? `, "${search}"` : ""}):\n`);
  for (const voice of library.voices) {
    const added = voice.is_added_by_user ? "  [already in your account]" : "";
    console.log(`• ${voice.name} — ${describe(voice.gender, voice.age, voice.accent, voice.use_case)}${added}`);
    if (voice.description) console.log(`    ${voice.description.replace(/\s+/g, " ").slice(0, 140)}`);
    console.log(`    voice_id=${voice.voice_id}  public_owner_id=${voice.public_owner_id}`);
    if (voice.preview_url) console.log(`    preview: ${voice.preview_url}`);
  }
  if (library.voices.length === 0) console.log("  (none found)");

  const mine = await api<{ voices: AccountVoice[] }>("/v2/voices?page_size=100");
  console.log("\nYour voices (usable as ELEVENLABS_VOICE_ID right away):\n");
  for (const voice of mine.voices) {
    const labels = voice.labels ?? {};
    console.log(`• ${voice.name} — ${describe(voice.category, labels.language, labels.accent, labels.gender)}`);
    console.log(`    voice_id=${voice.voice_id}`);
  }
}

async function addVoice(publicOwnerId: string, voiceId: string, name: string) {
  const added = await api<{ voice_id: string }>(
    `/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
    { method: "POST", body: JSON.stringify({ new_name: name }) },
  );
  console.log(`Added "${name}". Set in .env:\nELEVENLABS_VOICE_ID=${added.voice_id}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "add") {
  const [publicOwnerId, voiceId, name = "Integra"] = args;
  if (!publicOwnerId || !voiceId) {
    console.error("Usage: bun run assistant:voices -- add <public_owner_id> <voice_id> [name]");
    process.exit(1);
  }
  await addVoice(publicOwnerId, voiceId, name);
} else {
  const searchIndex = process.argv.indexOf("--search");
  await listVoices(searchIndex > 0 ? process.argv[searchIndex + 1] : undefined);
}
