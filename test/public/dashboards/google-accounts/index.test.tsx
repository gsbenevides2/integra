import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import { GoogleAccountsDashboard, googleAccountsDashboard } from "@public/dashboards/google-accounts/index";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

let accounts = ["a@x.com", "b@x.com"];
const calls = useApi({
  "GET /api/google/accounts": () => ({ accounts }),
  "DELETE /api/google/accounts/:email": ({ path }) =>
    decodeURIComponent(path).includes("b@x.com") ? fail() : { ok: true },
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  accounts = ["a@x.com", "b@x.com"];
});

const trash = (i: number) =>
  screen.getAllByRole("button").filter((b) => !b.getAttribute("aria-label"))[i]!;

describe("GoogleAccountsDashboard", () => {
  test("exports dashboard metadata", () => {
    expect(googleAccountsDashboard.id).toBe("google-accounts");
    expect(googleAccountsDashboard.content).toBe(GoogleAccountsDashboard);
  });

  test("lists accounts, opens menu and deletes one", async () => {
    renderWithProviders(<GoogleAccountsDashboard />);
    expect(screen.getByText("Carregando...")).toBeTruthy();
    await screen.findByText("a@x.com");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    accounts = ["b@x.com"];
    fireEvent.click(trash(0));
    fireEvent.click(await screen.findByText("Confirmar"));
    await screen.findByText("Conta removida");
    await waitFor(() => expect(screen.queryByText("a@x.com")).toBeNull());
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  test("cancelled confirm does nothing; failed delete shows error", async () => {
    renderWithProviders(<GoogleAccountsDashboard />);
    await screen.findByText("a@x.com");
    fireEvent.click(trash(0));
    fireEvent.click(await screen.findByText("Cancelar"));
    await waitFor(() => expect(screen.queryByText("Conta removida")).toBeNull());
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    fireEvent.click(trash(1));
    fireEvent.click(await screen.findByText("Confirmar"));
    await screen.findByText("Falha ao remover a conta");
  });

  test("empty state", async () => {
    accounts = [];
    renderWithProviders(<GoogleAccountsDashboard />);
    await screen.findByText("Nenhuma conta linkada.");
  });

  test("oauth success redirect toast and url cleanup", async () => {
    window.history.replaceState(null, "", "/?googleAccountAdded=1&keep=1");
    renderWithProviders(<GoogleAccountsDashboard />);
    await screen.findByText("Conta Google adicionada");
    expect(window.location.search).toBe("?keep=1");
  });

  test("oauth error redirect toast and url cleanup", async () => {
    window.history.replaceState(null, "", "/?googleAccountError=denied");
    renderWithProviders(<GoogleAccountsDashboard />);
    await screen.findByText("Falha ao adicionar conta: denied");
    expect(window.location.search).toBe("");
  });
});
