import React from "react";

export const PERMISSION_DENIED_MESSAGE = "Sem permissão";

/**
 * True when an error carries HTTP 403, whichever shape the Eden/fetch client
 * surfaces it in. Used to swap a panel for the neutral "Sem permissão" state
 * instead of an error.
 */
export function isAccessDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: number;
    value?: { status?: number };
    response?: { status?: number };
  };
  return (
    candidate.status === 403 ||
    candidate.value?.status === 403 ||
    candidate.response?.status === 403
  );
}

/**
 * Neutral inline stand-in for a panel the user has no grant for. It is
 * deliberately not styled as an error: the dashboard itself is fine, this
 * section just is not shared with this user.
 */
export function PermissionDenied({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-12 text-center">
      <p className="text-mist-200">{PERMISSION_DENIED_MESSAGE}</p>
      {label && <p className="text-xs text-mist-400">{label}</p>}
    </div>
  );
}
