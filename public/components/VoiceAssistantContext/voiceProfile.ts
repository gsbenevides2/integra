import { getAssistantEdenClient } from "@public/dashboards/voice-assistant/client";

/** The user's enrolled wake-word voice profile, as returned by the server. */
export interface VoiceProfile {
  enrolled: boolean;
  embeddings: number[][];
  dims: number;
  modelId: string;
}

/** Fetches the current user's voice profile; null if the route is forbidden. */
export async function fetchVoiceProfile(): Promise<VoiceProfile | null> {
  const { data, error } = await getAssistantEdenClient().api.assistant[
    "voice-profile"
  ].get();
  if (error) return null;
  return data;
}

/** Stores the current user's enrolled embeddings. */
export async function saveVoiceProfile(
  embeddings: number[][],
  modelId: string,
): Promise<void> {
  const { error } = await getAssistantEdenClient().api.assistant[
    "voice-profile"
  ].put({ embeddings, modelId });
  if (error) throw new Error("Falha ao salvar a sua voz");
}

/** Removes the current user's voice profile (wake word fires for any voice). */
export async function deleteVoiceProfile(): Promise<void> {
  const { error } = await getAssistantEdenClient().api.assistant[
    "voice-profile"
  ].delete();
  if (error) throw new Error("Falha ao remover a sua voz");
}
