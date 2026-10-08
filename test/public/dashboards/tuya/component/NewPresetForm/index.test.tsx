import React from "react";

import { NewPresetForm } from "@public/dashboards/tuya/component/NewPresetForm/index";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { fail, mockTuyaFetch } from "../../../../../helpers/tuya-fetch";
import { btn, field } from "../../../../../helpers/tuya-fixtures";
import { renderTuya } from "../../../../../helpers/tuya-render";

let m: ReturnType<typeof mockTuyaFetch>;
afterEach(() => {
  cleanup();
  m?.restore();
});

function setup() {
  const onCreated = mock(() => {});
  const onClose = mock(() => {});
  renderTuya(<NewPresetForm isOpen onCreated={onCreated} onClose={onClose} />);
  return { onCreated, onClose };
}

test("requires a name", async () => {
  m = mockTuyaFetch({});
  setup();
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Dê um nome ao modo");
});

test("creates", async () => {
  m = mockTuyaFetch({ "POST /api/tuya/presets": () => ({ id: "p" }) });
  const { onCreated, onClose } = setup();
  fireEvent.change(field("Nome"), { target: { value: "Noite" } });
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Modo cadastrado");
  expect(m.calls[0]!.body.name).toBe("Noite");
  expect(onCreated).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("failure and cancel", async () => {
  m = mockTuyaFetch({ "POST /api/tuya/presets": fail });
  const { onClose } = setup();
  fireEvent.change(field("Nome"), { target: { value: "Noite" } });
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Falha ao cadastrar o modo");
  fireEvent.click(btn("Cancelar"));
  expect(onClose).toHaveBeenCalled();
});
