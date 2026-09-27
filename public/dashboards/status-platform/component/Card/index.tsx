import React, { useCallback, useState } from "react";

import type { Platform } from "@server/modules/status-platform/model";
import { useConfirm } from "@public/components/ConfirmContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import {
  ArrowTopRightOnSquareIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { getStatusPlatformEdenClient } from "../../client";

interface Props {
  id: string;
  name: string;
  url: string;
  type: Platform;
  status: "OK" | "DOWN" | null;
  problemDescription: string | null;
  onDeleted: () => void;
  onEdit: () => void;
  onOpenHistory: () => void;
}

export function Card({
  id,
  name,
  url,
  type,
  status,
  problemDescription,
  onDeleted,
  onEdit,
  onOpenHistory,
}: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { showToast } = useToast();
  const confirm = useConfirm();

  const deletePlatform = useCallback(async () => {
    const confirmed = await confirm({
      title: "Delete platform",
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!confirmed) return;

    setIsDeleting(true);
    const { error } = await getStatusPlatformEdenClient()
      .api["status-platform"]({ id })
      .delete();
    if (error) {
      showToast("Failed to delete platform", "error");
      setIsDeleting(false);
      return;
    }
    showToast("Platform deleted successfully", "success");
    onDeleted();
  }, [confirm, id, name, onDeleted, showToast]);

  return (
    <div
      className={`
        flex cursor-pointer flex-col gap-1 rounded-md bg-gray-800 p-2 text-sm
        transition-opacity
        hover:bg-gray-700
        ${isDeleting ? "pointer-events-none opacity-50" : ""}
      `}
      onClick={onOpenHistory}
    >
      <div className="flex justify-between">
        <div>
          <p>Name: {name}</p>
          <p>URL: {url}</p>
          <p>Type: {type}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <IconButton
            className="hover:bg-gray-500"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            disabled={isDeleting}
          >
            <PencilIcon className="size-4.5" />
          </IconButton>
          <IconButton
            className="hover:bg-gray-500"
            onClick={(e) => {
              e.stopPropagation();
              deletePlatform();
            }}
            disabled={isDeleting}
          >
            <TrashIcon className="size-4.5" />
          </IconButton>
          <IconButton
            className="hover:bg-gray-500"
            onClick={(e) => {
              e.stopPropagation();
              window.open(url);
            }}
            disabled={isDeleting}
          >
            <ArrowTopRightOnSquareIcon className="size-4.5" />
          </IconButton>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1">
          <div
            className={`
              size-2 rounded-full
              ${
              status === "OK"
                ? "bg-green-700"
                : status === "DOWN"
                  ? "bg-red-700"
                  : "bg-gray-600"
            }
            `}
          />
          <p>
            Status:{" "}
            {status === "OK"
              ? "Operational"
              : status === "DOWN"
                ? "Down"
                : "Not checked yet"}
          </p>
        </div>
        {status === "DOWN" && problemDescription && (
          <p className="mt-0.5 text-xs text-red-400">{problemDescription}</p>
        )}
      </div>
    </div>
  );
}
