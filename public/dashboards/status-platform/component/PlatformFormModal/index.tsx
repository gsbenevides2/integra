import React, { useCallback, useState } from "react";

import { type Platform,PLATFORMS } from "@server/modules/status-platform/model";
import { Button } from "@public/components/Button";
import { Input } from "@public/components/Input";
import { Modal } from "@public/components/Modal";
import { Select } from "@public/components/Select";
import { useToast } from "@public/components/Toast";

import { getStatusPlatformEdenClient } from "../../client";

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
      if (!name) return showToast("Missing name!", "error");
      if (!type) return showToast("Missing type", "error");
      if (!url) return showToast("Missing url", "error");
      if (!isValidPlatform(type)) return showToast("Invalid type", "error");

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
            showToast(isEditing ? "Failed to update" : "Failed to save", "error");
            return;
          }
          showToast(
            isEditing ? "Platform updated successfully" : "Saved successfully",
            "success",
          );
          onSaved();
          onClose();
        })
        .catch(() => {
          showToast(isEditing ? "Failed to update" : "Failed to save", "error");
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
      title={isEditing ? "Edit Platform" : "Add Platform"}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={savePlatform}
        key={platform?.id ?? "new"}
      >
        <Input
          label="Name"
          type="text"
          id="name"
          placeholder="Type the platform name"
          defaultValue={platform?.name}
        />
        <Input
          label="Url"
          type="text"
          id="url"
          placeholder="Type the platform url"
          defaultValue={platform?.url}
        />
        <Select
          label="Type"
          id="type"
          defaultValue={platform?.type ?? ""}
          placeholder="Select the platform type"
          options={PLATFORMS.map((option) => ({
            label: option,
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
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
