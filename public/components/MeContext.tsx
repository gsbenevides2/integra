import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface ResourceGrant {
  resourceType: string;
  resourceId: string;
  action: string;
}

export interface Me {
  uid: string;
  username: string;
  name: string;
  routes: string[];
  resources: ResourceGrant[];
}

export interface MeContextValue {
  me: Me | null;
}

export const MeContext = createContext<MeContextValue>({ me: null });

/** The current user, or null when rendered outside a MeProvider (component tests). */
export function useMe(): MeContextValue {
  return useContext(MeContext);
}

/** Two-letter avatar initials derived from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

type MeStatus = "loading" | "ready" | "error";

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<MeStatus>("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/me");
      if (!response.ok) {
        setStatus("error");
        return;
      }
      setMe((await response.json()) as Me);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return (
      <div className="
        flex min-h-dvh items-center justify-center bg-gray-950 text-mist-300
      ">
        Carregando...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="
        flex min-h-dvh flex-col items-center justify-center gap-4 bg-gray-950
        text-center text-mist-200
      ">
        <p>Não foi possível identificar o usuário</p>
        <button
          type="button"
          onClick={() => void load()}
          className="
            rounded-md bg-blue-900 px-4 py-2 text-sm text-white
            hover:bg-blue-800
          "
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return <MeContext.Provider value={{ me }}>{children}</MeContext.Provider>;
}
