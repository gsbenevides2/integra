import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const { MotivaTrilhosDashboard, motivaTrilhosDashboard } = await import("@public/dashboards/motiva-trilhos/index");

let reply: unknown = { legs: [] };
useApi({ "GET /api/motiva-trilhos": () => reply });

afterEach(() => {
  cleanup();
  reply = { legs: [] };
});

describe("MotivaTrilhosDashboard", () => {
  test("shows the ETA for each leg, grouped by trip", async () => {
    reply = {
      legs: [
        { id: "luz-pinheiros", label: "Luz → Pinheiros", line: "4", trip: "to-work", etaMin: 0 },
        { id: "pinheiros-morumbi", label: "Pinheiros → Morumbi", line: "9", trip: "to-work", etaMin: 5 },
        { id: "morumbi-pinheiros", label: "Morumbi → Pinheiros", line: "9", trip: "to-home", etaMin: undefined },
        { id: "pinheiros-luz", label: "Pinheiros → Luz", line: "4", trip: "to-home", etaMin: 12 },
      ],
    };
    const { unmount } = renderWithProviders(<MotivaTrilhosDashboard />);
    expect(motivaTrilhosDashboard.id).toBe("motiva-trilhos");
    screen.getByText("Buscando próximos trens…");
    await screen.findByText("Indo para o trabalho");
    screen.getByText("Voltando para casa");
    screen.getByText("Chegando");
    screen.getByText("5 min");
    screen.getByText("Sem previsão");
    screen.getByText("12 min");
    screen.getByText("Luz → Pinheiros");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    unmount();
  });

  test("toasts when the request fails", async () => {
    reply = fail();
    renderWithProviders(<MotivaTrilhosDashboard />);
    await screen.findByText("Falha ao buscar os trens");
  });
});
