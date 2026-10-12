import React, { useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import { Modal } from "@public/components/Modal";
import { useToast } from "@public/components/Toast";
import { useVoiceAssistant } from "@public/components/VoiceAssistantContext";
import { resumeAudio } from "@public/components/VoiceAssistantContext/microphone";
import { loadSpeakerModel } from "@public/components/VoiceAssistantContext/speakerModel";
import { captureUtterance } from "@public/components/VoiceAssistantContext/transcriber";
import {
  createVoiceProfile,
  deleteVoiceProfile,
  fetchVoiceProfiles,
  renameVoiceProfile,
  type VoiceProfile,
} from "@public/components/VoiceAssistantContext/voiceProfile";

import { getAssistantEdenClient } from "./client";

/** Mirrors MAX_EXTRA_INSTRUCTIONS_LENGTH on the server. */
export const MAX_EXTRA_INSTRUCTIONS_LENGTH = 4000;
/** How many "Ei Integra" samples to collect when enrolling a voice. */
export const ENROLL_SAMPLES = 4;
/** Default cosine cutoff; mirrors DEFAULT_VOICE_MATCH_THRESHOLD on the server. */
export const DEFAULT_VOICE_MATCH_THRESHOLD = 0.6;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** The user's own instructions and their wake-word voice, only for them. */
export function SettingsModal({ isOpen, onClose }: Props) {
  const { showToast } = useToast();
  const { voiceModel, reloadVoiceProfile } = useVoiceAssistant();
  const [instructions, setInstructions] = useState("");
  const [threshold, setThreshold] = useState(DEFAULT_VOICE_MATCH_THRESHOLD);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  /** The user's enrolled voices for the current model. */
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  /** Null = idle; otherwise the enrolment progress message. */
  const [enrolling, setEnrolling] = useState<string | null>(null);

  const reloadVoices = async () => {
    const profiles = await fetchVoiceProfiles();
    setVoices(profiles.filter((profile) => profile.modelId === voiceModel?.id));
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsLoading(true);
    void Promise.all([
      getAssistantEdenClient().api.assistant.settings.get(),
      fetchVoiceProfiles(),
    ]).then(([settings, profiles]) => {
      if (!active) return;
      if (settings.error || !settings.data) {
        showToast("Falha ao carregar suas preferências", "error");
      } else {
        setInstructions(settings.data.extraInstructions);
        setThreshold(settings.data.voiceMatchThreshold);
      }
      setVoices(profiles.filter((profile) => profile.modelId === voiceModel?.id));
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isOpen, showToast, voiceModel]);

  const save = async () => {
    setIsSaving(true);
    const { error } = await getAssistantEdenClient().api.assistant.settings.put({
      extraInstructions: instructions,
      voiceMatchThreshold: threshold,
    });
    setIsSaving(false);
    if (error) {
      showToast("Falha ao salvar suas preferências", "error");
      return;
    }
    reloadVoiceProfile();
    showToast("Preferências salvas", "success");
    onClose();
  };

  const enroll = async () => {
    if (!voiceModel) return;
    const label = window.prompt("Nome desta voz (ex.: Gui, celular):")?.trim();
    if (!label) return;
    try {
      resumeAudio();
      const model = await loadSpeakerModel(voiceModel.url, voiceModel.id);
      const embeddings: number[][] = [];
      for (let i = 0; i < ENROLL_SAMPLES; i++) {
        setEnrolling(`Diga "Ei Integra" (${i + 1}/${ENROLL_SAMPLES})…`);
        const { samples, sampleRate } = await captureUtterance(8000);
        const embedding = await model.embed(samples, sampleRate);
        embeddings.push(Array.from(embedding));
      }
      setEnrolling("Salvando…");
      await createVoiceProfile(label, embeddings, voiceModel.id);
      await reloadVoices();
      reloadVoiceProfile();
      showToast("Voz cadastrada", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Falha ao cadastrar a voz", "error");
    } finally {
      setEnrolling(null);
    }
  };

  const rename = async (voice: VoiceProfile) => {
    const label = window.prompt("Novo nome desta voz:", voice.label)?.trim();
    if (!label || label === voice.label) return;
    try {
      await renameVoiceProfile(voice.id, label);
      await reloadVoices();
      showToast("Voz renomeada", "success");
    } catch {
      showToast("Falha ao renomear a voz", "error");
    }
  };

  const remove = async (voice: VoiceProfile) => {
    try {
      await deleteVoiceProfile(voice.id);
      await reloadVoices();
      reloadVoiceProfile();
      showToast("Voz removida", "success");
    } catch {
      showToast("Falha ao remover a voz", "error");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Minhas preferências">
      <div className="flex flex-col gap-3">
        <label htmlFor="assistant-instructions" className="
          text-xs text-mist-300
        ">
          Instruções para a Integra (só valem para você)
        </label>
        <textarea
          id="assistant-instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          disabled={isLoading}
          maxLength={MAX_EXTRA_INSTRUCTIONS_LENGTH}
          rows={6}
          placeholder="Ex.: Me chame de Gui. Responda de forma bem curta."
          className="
            rounded-md border border-mist-600 bg-gray-900 p-2 text-sm outline-0
            focus:border-mist-300
          "
        />
        <p className="text-[11px] text-mist-500">
          {instructions.length}/{MAX_EXTRA_INSTRUCTIONS_LENGTH} caracteres. Vale
          a partir da próxima mensagem.
        </p>

        {voiceModel && (
          <div className="flex flex-col gap-2 border-t border-mist-700 pt-3">
            <span className="text-xs text-mist-300">
              Vozes — só o “Ei Integra” dito por uma voz cadastrada ativa a assistente
            </span>
            <p className="text-[11px] text-mist-500">
              {voices.length > 0
                ? "Outras vozes (e a TV) são ignoradas."
                : "Sem voz cadastrada: o \"Ei Integra\" ativa com qualquer voz."}
            </p>
            {voices.length > 0 && (
              <ul className="flex flex-col gap-1">
                {voices.map((voice) => (
                  <li key={voice.id} className="
                    flex items-center justify-between gap-2 rounded-md
                    bg-gray-900 px-2 py-1
                  ">
                    <span className="truncate text-sm text-mist-200">{voice.label}</span>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="secondary" onClick={() => void rename(voice)}>
                        Renomear
                      </Button>
                      <Button variant="secondary" onClick={() => void remove(voice)}>
                        Remover
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {enrolling ? (
              <p className="text-sm text-mist-200">{enrolling}</p>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void enroll()} disabled={isLoading}>
                  Adicionar voz
                </Button>
              </div>
            )}

            <label htmlFor="voice-threshold" className="
              mt-1 text-xs text-mist-300
            ">
              Rigidez do reconhecimento: {Math.round(threshold * 100)}%
            </label>
            <input
              id="voice-threshold"
              type="range"
              min={30}
              max={90}
              value={Math.round(threshold * 100)}
              onChange={(event) => setThreshold(Number(event.target.value) / 100)}
              disabled={isLoading}
            />
            <p className="text-[11px] text-mist-500">
              Mais alto = mais rígido (menos falso positivo, mas pode te ignorar).
              Mais baixo = ativa mais fácil.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} isLoading={isSaving} disabled={isLoading}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
