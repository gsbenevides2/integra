import React, { useState } from "react";

import { initialsOf, useMe } from "@public/components/MeContext";
import { APP_VERSION } from "@public/version";

import { getRumSessionId } from "../../instrumentFrontend";
import { useToast } from "../ToastContext";
import { useGlobalDrawer } from "./index";

export function Content() {
  const [sessionId] = useState<string>(() => getRumSessionId() ?? "");
  const toast = useToast();
  const { me } = useMe();
  const { dashboardList, page, setPage, setIsOpen } = useGlobalDrawer();

  const name = me?.name ?? "";
  const username = me?.username ?? "";

  const copyRumSessionId = () => {
    navigator.clipboard.writeText(sessionId);
    toast.showToast("Copiado para área de transferencia", "success");
  };

  return (
    <div className="flex h-full flex-1 flex-col gap-4">
      <div className="flex items-center gap-2 px-5 py-3">
        <div
          className="
            flex size-14 shrink-0 items-center justify-center rounded-full
            bg-blue-900 text-lg
          "
        >
          {initialsOf(name)}
        </div>
        <div className="flex min-w-0 flex-col text-sm">
          <span className="truncate text-lg">{name}</span>
          <span className="truncate">{username}</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {dashboardList.map((dashboard) => (
          <button
            key={dashboard.id}
            type="button"
            onClick={() => {
              setPage(dashboard.id);
              setIsOpen(false);
            }}
            className={`
              flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm
              ${
                dashboard.id === page
                  ? "bg-blue-900 text-white"
                  : `
                    text-gray-300
                    hover:bg-gray-800
                  `
              }
            `}
          >
            <dashboard.icon className="size-5 shrink-0" />
            {dashboard.name}
          </button>
        ))}
      </nav>
      <div
        className="
          border-t border-gray-800 py-2 text-center text-xs text-gray-500
        "
      >
        v{APP_VERSION}
        <br />
        <span onClick={copyRumSessionId} className="cursor-pointer">
          RUM Session Id: {sessionId}
        </span>
      </div>
    </div>
  );
}
