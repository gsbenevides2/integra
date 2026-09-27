import React, { useCallback, useEffect, useState } from "react";

import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import {
  Bars3Icon,
  PlusIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import { getGoogleAccountsEdenClient } from "./client";
import { GoogleAccountCard } from "./component/Card";

export function GoogleAccountsDashboard() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const globalDrawer = useGlobalDrawer();

  const fetchAccounts = useCallback(async () => {
    const { data } =
      await getGoogleAccountsEdenClient().api.google.accounts.get();
    if (data) setAccounts(data.accounts);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();

    const params = new URLSearchParams(window.location.search);
    if (params.has("googleAccountAdded")) {
      showToast("Conta Google adicionada", "success");
    } else if (params.has("googleAccountError")) {
      showToast(
        `Falha ao adicionar conta: ${params.get("googleAccountError")}`,
        "error",
      );
    }
    if (params.has("googleAccountAdded") || params.has("googleAccountError")) {
      params.delete("googleAccountAdded");
      params.delete("googleAccountError");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (query ? `?${query}` : ""),
      );
    }
    // Only ever needs to run once, right after the OAuth redirect lands.
  }, []);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconButton
            onClick={() => globalDrawer.setIsOpen(true)}
            aria-label="Abrir menu"
          >
            <Bars3Icon className="size-5" />
          </IconButton>
          <h2 className="text-lg font-semibold">Contas Google</h2>
        </div>
        <a
          href="/api/google/oauth/start"
          className="
            flex cursor-pointer items-center gap-1 rounded-md bg-mist-900 px-3
            py-1.5 text-sm transition-colors
            hover:bg-mist-600
          "
        >
          <PlusIcon className="size-4" /> Adicionar conta
        </a>
      </div>
      {isLoading ? (
        <p className="text-sm text-mist-300">Carregando...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-mist-300">Nenhuma conta linkada.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((email) => (
            <GoogleAccountCard
              key={email}
              email={email}
              onDeleted={fetchAccounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const googleAccountsDashboard: DashboardData = {
  id: "google-accounts",
  content: GoogleAccountsDashboard,
  icon: UserGroupIcon,
  name: "Google Accounts",
};
