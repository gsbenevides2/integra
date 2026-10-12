import { getAssistantEdenClient } from "@public/dashboards/voice-assistant/client";

/** One of the current user's enrolled wake-word voices, as returned by the server. */
export interface VoiceProfile {
  id: string;
  label: string;
  embeddings: number[][];
  dims: number;
  modelId: string;
}

/** Fetches the current user's enrolled voices; empty if the route is forbidden. */
export async function fetchVoiceProfiles(): Promise<VoiceProfile[]> {
  const { data, error } = await getAssistantEdenClient().api.assistant[
    "voice-profiles"
  ].get();
  if (error || !data) return [];
  return data;
}

/** Enrols a new labelled voice from its client-extracted embeddings. */
export async function createVoiceProfile(
  label: string,
  embeddings: number[][],
  modelId: string,
): Promise<void> {
  const { error } = await getAssistantEdenClient().api.assistant[
    "voice-profiles"
  ].post({ label, embeddings, modelId });
  if (error) throw new Error("Falha ao salvar a voz");
}

/** Renames one of the current user's enrolled voices. */
export async function renameVoiceProfile(id: string, label: string): Promise<void> {
  const { error } = await getAssistantEdenClient()
    .api.assistant["voice-profiles"]({ id })
    .patch({ label });
  if (error) throw new Error("Falha ao renomear a voz");
}

/** Removes one of the current user's enrolled voices. */
export async function deleteVoiceProfile(id: string): Promise<void> {
  const { error } = await getAssistantEdenClient()
    .api.assistant["voice-profiles"]({ id })
    .delete();
  if (error) throw new Error("Falha ao remover a voz");
}
