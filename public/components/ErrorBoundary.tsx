import React, { Component, type ErrorInfo, type ReactNode } from "react";

import { reportError } from "@public/instrumentFrontend";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { Button } from "./Button";

export const CRASH_TITLE = "Algo deu errado";
export const CRASH_DESCRIPTION =
  "Esta tela foi interrompida por um erro inesperado. A falha foi registrada no OpenObserve com os identificadores abaixo — use-os para abrir a sessão e a trace exatas no painel.";
export const CRASH_RELOAD_LABEL = "Recarregar a página";
export const CRASH_COPY_LABEL = "Copiar identificadores";
export const CRASH_COPIED_LABEL = "Identificadores copiados!";
export const CRASH_SESSION_LABEL = "Sessão RUM";
export const CRASH_TRACE_LABEL = "Trace";
export const CRASH_EVENT_NAME = "react.error_boundary";

/** Message of anything that can be thrown, `String()`ed when it is not an Error. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Props {
  children: ReactNode;
  /**
   * When it changes, an errored boundary forgets the failure and renders
   * `children` again. Pass the id of the screen being rendered, so navigating
   * away from a broken dashboard recovers without a reload.
   */
  resetKey?: string;
}

interface State {
  errored: boolean;
  message: string;
  ids: { sessionId?: string; traceId?: string };
  copied: boolean;
}

/**
 * Catches render errors under it and shows a friendly screen instead of a blank
 * page, reporting the failure to OpenObserve (RUM event + trace span) and
 * surfacing the ids that identify it there. It is deliberately dependency-free
 * (no context, no toast) so it can also wrap the providers themselves.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { errored: false, message: "", ids: {}, copied: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { errored: true, message: messageOf(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.setState({
      ids: reportError(CRASH_EVENT_NAME, error, {
        component_stack: info.componentStack ?? "",
      }),
    });
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.errored && previous.resetKey !== this.props.resetKey) {
      this.setState({ errored: false, message: "", ids: {}, copied: false });
    }
  }

  private readonly reload = () => {
    window.location.reload();
  };

  private readonly copyIds = () => {
    const { ids, message } = this.state;
    const details = [
      `${CRASH_SESSION_LABEL}: ${ids.sessionId ?? "-"}`,
      `${CRASH_TRACE_LABEL}: ${ids.traceId ?? "-"}`,
      `Erro: ${message}`,
    ].join("\n");
    void navigator.clipboard?.writeText(details).catch(() => undefined);
    this.setState({ copied: true });
  };

  render(): ReactNode {
    const { errored, message, ids, copied } = this.state;
    if (!errored) return this.props.children;

    return (
      <div className="
        flex h-full min-h-[60dvh] flex-1 items-center justify-center p-6
      ">
        <div className="
          flex w-full max-w-md flex-col items-center gap-3 rounded-xl border
          border-gray-800 bg-gray-900 p-6 text-center
        ">
          <ExclamationTriangleIcon className="size-10 text-amber-400" />
          <h1 className="text-lg font-medium text-mist-100">{CRASH_TITLE}</h1>
          <p className="text-sm text-mist-300">{CRASH_DESCRIPTION}</p>
          <p className="
            w-full rounded-md bg-gray-950 p-2 text-left font-mono text-xs
            wrap-break-word text-red-300
          ">
            {message}
          </p>
          <dl className="flex w-full flex-col text-left text-xs text-mist-400">
            <div className="flex gap-2">
              <dt className="shrink-0">{CRASH_SESSION_LABEL}:</dt>
              <dd className="break-all">{ids.sessionId ?? "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0">{CRASH_TRACE_LABEL}:</dt>
              <dd className="break-all">{ids.traceId ?? "-"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={this.reload}>
              {CRASH_RELOAD_LABEL}
            </Button>
            <Button type="button" variant="secondary" onClick={this.copyIds}>
              {copied ? CRASH_COPIED_LABEL : CRASH_COPY_LABEL}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
