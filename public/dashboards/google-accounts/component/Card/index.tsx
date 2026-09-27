import React from "react";

import { useConfirm } from "@public/components/ConfirmContext";
import { useToast } from "@public/components/Toast";

import { TrashIcon } from "@heroicons/react/24/outline";

import { getGoogleAccountsEdenClient } from "../../client";

interface Props {
  email: string;
  onDeleted: () => void;
}

export function GoogleAccountCard({ email, onDeleted }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const remove = async () => {
    const ok = await confirm({
      title: "Remover conta",
      message: `Remover a conta Google "${email}"?`,
    });
    if (!ok) return;
    const { error } = await getGoogleAccountsEdenClient()
      .api.google.accounts({ email })
      .delete();
    if (error) {
      showToast("Falha ao remover a conta", "error");
      return;
    }
    showToast("Conta removida", "success");
    onDeleted();
  };

  return (
    <div className="
      flex items-center justify-between gap-3 rounded-lg bg-gray-800 p-3
    ">
      <span className="truncate text-sm">{email}</span>
      <button
        type="button"
        onClick={remove}
        className="
          shrink-0 cursor-pointer rounded-full p-1 text-mist-300
          transition-colors
          hover:bg-gray-700
        "
      >
        <TrashIcon className="size-4" />
      </button>
    </div>
  );
}
