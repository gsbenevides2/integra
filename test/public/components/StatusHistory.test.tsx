import React from "react";

import {
  formatClock,
  formatDateTime,
  formatDuration,
  formatDurationLong,
  formatPercent,
  formatRange,
  StatusHistoryModal,
  type StatusHistoryModalProps,
  type StatusVisual,
} from "@public/components/StatusHistory";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

afterEach(cleanup);

const VISUALS: Record<string, StatusVisual> = {
  OK: {
    label: "Operacional",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500/80",
    text: "text-emerald-300",
    ring: "ring-emerald-500/15",
  },
  DOWN: {
    label: "Fora do ar",
    dot: "bg-rose-500",
    bar: "bg-rose-500/80",
    text: "text-rose-300",
  },
};

const at = new Date(2026, 0, 2, 12, 0, 0).getTime();
const iso = (minutesAgo: number) => new Date(at - minutesAgo * 60_000).toISOString();

let restoreNow = () => {};
beforeEach(() => {
  const original = Date.now;
  Date.now = () => at;
  restoreNow = () => {
    Date.now = original;
  };
});
afterEach(() => restoreNow());

function renderModal(overrides: Partial<StatusHistoryModalProps> = {}) {
  const props: StatusHistoryModalProps = {
    isOpen: true,
    onClose: mock(),
    title: "Histórico - Teste",
    subtitle: "https://example.test",
    subtitleDot: "#22c55e",
    isLoading: false,
    checks: [{ checkedAt: iso(200) }, { checkedAt: iso(0) }],
    segments: [
      {
        status: "OK",
        startedAt: iso(200),
        endedAt: iso(20),
        description: null,
      },
      {
        status: "DOWN",
        startedAt: iso(20),
        endedAt: null,
        description: "Fora do ar",
      },
    ],
    visuals: VISUALS,
    healthyStatuses: ["OK"],
    hasMore: false,
    isLatest: true,
    onGoOlder: mock(),
    onGoNewer: mock(),
    ...overrides,
  };
  return { props, ...render(<StatusHistoryModal {...props} />) };
}

describe("formatters", () => {
  test("compact and long durations", () => {
    expect(formatDuration(-1)).toBe("0s");
    expect(formatDuration(30_000)).toBe("30s");
    expect(formatDuration(4 * 60_000)).toBe("4min");
    expect(formatDuration(3 * 3_600_000)).toBe("3h");
    expect(formatDuration(2 * 86_400_000)).toBe("2d");

    expect(formatDurationLong(30_000)).toBe("30s");
    expect(formatDurationLong(4 * 60_000)).toBe("4min");
    expect(formatDurationLong(3 * 3_600_000)).toBe("3h");
    expect(formatDurationLong(3 * 3_600_000 + 20 * 60_000)).toBe("3h 20min");
    expect(formatDurationLong(2 * 86_400_000)).toBe("2d");
    expect(formatDurationLong(2 * 86_400_000 + 4 * 3_600_000)).toBe("2d 4h");
  });

  test("dates, clocks, percent and ranges", () => {
    const date = new Date(2026, 0, 2, 3, 4, 5);
    expect(formatDateTime(date)).toBe("02/01 03:04");
    expect(formatDateTime(date, { withYear: true })).toBe("02/01/2026 03:04");
    expect(formatDateTime(date, { withSeconds: true })).toBe("02/01 03:04:05");
    expect(
      formatDateTime(date, { withYear: true, withSeconds: true }),
    ).toBe("02/01/2026 03:04:05");
    expect(formatClock(date)).toBe("03:04");

    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.1234)).toBe("12,3%");

    expect(formatRange([])).toBe("Sem verificações");
    expect(
      formatRange([
        { checkedAt: new Date(2026, 0, 2, 3, 4) },
        { checkedAt: new Date(2026, 0, 2, 4, 5) },
      ]),
    ).toBe("02/01 03:04 – 02/01 04:05");
  });
});

describe("StatusHistoryModal", () => {
  test("renders summary, timeline, legend and event rows", () => {
    renderModal();

    expect(screen.getByText("Histórico - Teste")).toBeTruthy();
    expect(screen.getByText("https://example.test")).toBeTruthy();
    expect(screen.getByText("Disponibilidade")).toBeTruthy();
    expect(screen.getAllByText("90%").length).toBeGreaterThan(0);
    expect(screen.getByText("3h 20min")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("trecho afetado")).toBeTruthy();
    expect(screen.getByText("Linha do tempo")).toBeTruthy();
    expect(screen.getAllByText("Operacional").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fora do ar").length).toBeGreaterThan(0);
    expect(screen.getByText("Histórico detalhado")).toBeTruthy();
    expect(screen.getByText("2 registros")).toBeTruthy();
    expect(screen.getAllByText(/desde/).length).toBe(2);
    expect(screen.getAllByText(/por /).length).toBe(2);
    expect(screen.getByText("em andamento")).toBeTruthy();
    expect(screen.getByText("Fora do ar", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("02/01 08:40 – 02/01 12:00")).toBeTruthy();
  });

  test("empty and loading states", () => {
    const { unmount } = renderModal({
      checks: [],
      segments: [],
      isLatest: true,
    });
    expect(
      screen.getByText("Nenhum histórico disponível para este período."),
    ).toBeTruthy();
    expect(screen.getByText("Sem verificações")).toBeTruthy();
    unmount();

    renderModal({ isLoading: true });
    expect(screen.getByText("Carregando histórico...")).toBeTruthy();
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  test("older pages show open-at-page-edge instead of a wrong duration", () => {
    renderModal({ isLatest: false, hasMore: true });
    expect(screen.getByText("em aberto")).toBeTruthy();
    expect(screen.getByText("Período anterior")).toBeTruthy();
    expect(screen.queryByText("em andamento")).toBeNull();
    expect(
      (screen.getByLabelText("Período mais recente") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  test("filters the detailed history down to incidents", () => {
    renderModal();
    expect(screen.getByText("2 registros")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Só intercorrências" }));
    expect(screen.getByText("1 registro")).toBeTruthy();
    expect(screen.getAllByText(/desde/).length).toBe(1);
    expect(screen.getByText("Fora do ar", { selector: "p" })).toBeTruthy();
    expect(screen.getAllByText("Operacional").length).toBeGreaterThan(0); // legend + timeline

    fireEvent.click(screen.getByRole("switch", { name: "Só intercorrências" }));
    expect(screen.getByText("2 registros")).toBeTruthy();
    expect(screen.getAllByText(/desde/).length).toBe(2);
  });

  test("shows a friendly message when the filter finds no incidents", () => {
    renderModal({
      segments: [
        {
          status: "OK",
          startedAt: iso(200),
          endedAt: iso(0),
          description: null,
        },
      ],
    });

    fireEvent.click(screen.getByRole("switch", { name: "Só intercorrências" }));
    expect(screen.getByText("Nenhuma intercorrência neste período.")).toBeTruthy();
  });

  test("timeline segments expose status and time to assistive tech", () => {
    renderModal();
    expect(screen.getByRole("list", { name: "Linha do tempo do status" })).toBeTruthy();
    expect(
      screen.getByRole("listitem", {
        name: "Fora do ar: 20min, das 11:40 até agora",
      }),
    ).toBeTruthy();
  });

  test("pagination, close button, backdrop and Escape", () => {
    const { props } = renderModal({ isLatest: false, hasMore: true });
    const older = screen.getByLabelText("Período mais antigo");
    const newer = screen.getByLabelText("Período mais recente");
    fireEvent.click(older);
    fireEvent.click(newer);
    expect(props.onGoOlder).toHaveBeenCalledTimes(1);
    expect(props.onGoNewer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Fechar histórico"));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Histórico - Teste"));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const overlay = screen.getByText("Histórico - Teste").closest(".fixed")!;
    fireEvent.click(overlay);
    expect(props.onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  test("falls back to a generic visual and hides optional subtitle/detail", () => {
    const { unmount } = renderModal({
      subtitle: undefined,
      subtitleDot: undefined,
      segments: [
        {
          status: "SECRET",
          startedAt: iso(10),
          endedAt: iso(0),
        },
      ],
    });
    expect(screen.getAllByText("Desconhecido").length).toBeGreaterThan(0);
    expect(screen.queryByText("https://example.test")).toBeNull();
    expect(screen.queryByText("em andamento")).toBeNull();
    expect(screen.queryByText("em aberto")).toBeNull();
    unmount();
  });

  test("moves focus into the dialog and restores it when closed", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    const { unmount } = renderModal();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  test("does not lock the page while closed", () => {
    const previous = document.body.style.overflow;
    const { rerender, props } = renderModal({ isOpen: false });
    expect(document.body.style.overflow).toBe(previous);
    rerender(<StatusHistoryModal {...props} isOpen />);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<StatusHistoryModal {...props} isOpen={false} />);
    expect(document.body.style.overflow).toBe(previous);
  });
});
