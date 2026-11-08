import React, { useCallback, useState } from "react";

import { type Platform,PLATFORMS } from "@server/modules/status-platform/model";
import { Button } from "@public/components/Button";
import { Input } from "@public/components/Input";
import { Modal } from "@public/components/Modal";
import { Select } from "@public/components/Select";
import { useToast } from "@public/components/Toast";

import { getStatusPlatformEdenClient } from "../../client";
import { PLATFORM_LABELS } from "../../labels";

export interface PlatformFormValues {
  id: string;
  name: string;
  url: string;
  type: Platform;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
  isOpen: boolean;
  platform?: PlatformFormValues;
}

function isValidPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function PlatformFormModal({
  onClose,
  onSaved,
  isOpen,
  platform,
}: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  const isEditing = Boolean(platform);

  const savePlatform = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const name = formData.get("name")?.toString();
      const type = formData.get("type")?.toString();
      const url = formData.get("url")?.toString();
      if (!name) return showToast("Informe o nome", "error");
      if (!type) return showToast("Informe o tipo", "error");
      if (!url) return showToast("Informe a URL", "error");
      if (!isValidPlatform(type)) return showToast("Tipo inválido", "error");

      const client = getStatusPlatformEdenClient();

      setIsSaving(true);
      const request = platform
        ? client.api["status-platform"]({ id: platform.id }).patch({
            name,
            type,
            url,
          })
        : client.api["status-platform"].post({ name, type, url });

      request
        .then(({ error }) => {
          if (error) {
            showToast(isEditing ? "Falha ao atualizar" : "Falha ao salvar", "error");
            return;
          }
          showToast(
            isEditing ? "Plataforma atualizada" : "Plataforma salva",
            "success",
          );
          onSaved();
          onClose();
        })
        .catch(() => {
          showToast(isEditing ? "Falha ao atualizar" : "Falha ao salvar", "error");
        })
        .finally(() => {
          setIsSaving(false);
        });
    },
    [isEditing, onClose, onSaved, platform, showToast],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Editar plataforma" : "Adicionar plataforma"}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={savePlatform}
        key={platform?.id ?? "new"}
      >
        <Input
          label="Nome"
          type="text"
          id="name"
          placeholder="Digite o nome da plataforma"
          defaultValue={platform?.name}
        />
        <Input
          label="URL"
          type="text"
          id="url"
          placeholder="Digite a URL da plataforma"
          defaultValue={platform?.url}
        />
        <Select
          label="Tipo"
          id="type"
          defaultValue={platform?.type ?? ""}
          placeholder="Selecione o tipo da plataforma"
          options={PLATFORMS.map((option) => ({
            label: PLATFORM_LABELS[option],
            value: option,
          }))}
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
