import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const { birthdayDashboard } = await import("@public/dashboards/birthday/index");
const Dashboard = birthdayDashboard.content;

const month = new Date().getMonth() + 1;
const rows = [
  { id: "1", title: "Ana", month, day: 5 },
  { id: "2", title: "Bia", month: month === 12 ? 1 : month + 1, day: 7 },
];

let listReply: unknown = rows;
let writeFail = false;
const calls = useApi({
  "GET /api/birthday/list": () => listReply,
  "POST /api/birthday": () => (writeFail ? fail() : { id: "n" }),
  "PATCH /api/birthday/:id": () => (writeFail ? fail() : { id: "1" }),
  "DELETE /api/birthday/:id": () => (writeFail ? fail() : { id: "1" }),
});
afterEach(() => {
  cleanup();
  listReply = rows;
  writeFail = false;
});

const chip = (day: number, title: string) => within(screen.getByTestId(`day-${day}`)).getByText(title);
const setField = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.submit(screen.getByText("Salvar").closest("form")!);

describe("BirthdayDashboard", () => {
  test("metadata, month events and navigation", async () => {
    renderWithProviders(<Dashboard />);
    expect(birthdayDashboard.id).toBe("birthday");
    await screen.findAllByText("Ana");
    expect(within(screen.getByTestId("day-7")).queryByText("Bia")).toBeNull();
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    fireEvent.click(screen.getByLabelText("Próximo mês"));
    await screen.findAllByText("Bia");
    chip(7, "Bia");
    fireEvent.click(screen.getByLabelText("Mês anterior"));
    fireEvent.click(screen.getByLabelText("Mês anterior"));
    await screen.findByText(/^Nenhum evento em/);
    fireEvent.click(screen.getByText("Ir para"));
    fireEvent.click(screen.getByText("Fev"));
    expect(screen.getByText("Fevereiro")).toBeTruthy();
    expect(screen.queryByText("Fev")).toBeNull();
    fireEvent.click(screen.getByText("Ir para"));
    fireEvent.click(document.querySelector(".fixed.inset-0.z-10")!);
    expect(screen.queryByText("Fev")).toBeNull();
    fireEvent.click(screen.getByText("Hoje"));
    await screen.findAllByText("Ana");
  });

  test("list failure toasts", async () => {
    listReply = fail();
    renderWithProviders(<Dashboard />);
    await screen.findByText("Falha ao buscar eventos");
  });

  test("create: validation, failure and success", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findAllByText("Ana");
    fireEvent.click(screen.getByTestId("day-9"));
    expect((screen.getByLabelText("Dia") as HTMLInputElement).value).toBe("9");
    submit();
    await screen.findByText("Informe o título");
    setField("Título", "Caio");
    setField("Mês", "13");
    submit();
    await screen.findByText("Mês inválido");
    setField("Mês", "2");
    setField("Dia", "31");
    submit();
    await screen.findByText(/Dia inválido/);
    setField("Mês", String(month));
    setField("Dia", "9");
    writeFail = true;
    submit();
    await screen.findByText("Falha ao salvar evento");
    writeFail = false;
    submit();
    await screen.findByText("Evento criado");
    expect(calls.at(-2)!.body).toEqual({ title: "Caio", month, day: 9 });
  });

  test("header button creates; edit saves", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findAllByText("Ana");
    fireEvent.click(screen.getAllByText("Criar evento")[0]!);
    fireEvent.click(screen.getAllByText("Cancelar")[0]!);
    fireEvent.click(chip(5, "Ana"));
    await screen.findByText("Editar evento");
    setField("Título", "Ana Maria");
    submit();
    await screen.findByText("Evento atualizado");
    expect(calls.some((c) => c.method === "PATCH")).toBe(true);
  });

  test("delete: cancel, fail, success", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findAllByText("Ana");
    fireEvent.click(chip(5, "Ana"));
    const del = () => fireEvent.click(screen.getByText("Deletar", { selector: "form button" }));
    const inDialog = async (label: string) => fireEvent.click((await screen.findAllByText(label)).find((el) => !el.closest("form"))!);

    del();
    await inDialog("Cancelar");
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    writeFail = true;
    del();
    await inDialog("Deletar");
    await screen.findByText("Falha ao deletar evento");
    writeFail = false;
    del();
    await inDialog("Deletar");
    await screen.findByText("Evento deletado");
  });
});
