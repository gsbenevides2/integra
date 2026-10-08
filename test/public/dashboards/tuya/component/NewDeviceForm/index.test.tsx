import React from "react";

import { NewDeviceForm } from "@public/dashboards/tuya/component/NewDeviceForm/index";

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
  renderTuya(<NewDeviceForm isOpen onCreated={onCreated} onClose={onClose} />);
  return { onCreated, onClose };
}
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });

test("validates required fields", async () => {
  m = mockTuyaFetch({});
  setup();
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Preencha nome e device ID");
  expect(m.calls.length).toBe(0);
});

test("submits a switch with channel count", async () => {
  m = mockTuyaFetch({ "POST /api/tuya/devices": () => ({ id: "x" }) });
  const { onCreated, onClose } = setup();
  type("Nome", "Quarto");
  type("Device ID (Tuya)", "abc");
  fireEvent.change(field("Tipo"), { target: { value: "switch" } });
  type("Quantidade de canais", "3");
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Dispositivo cadastrado");
  expect(m.calls[0]!.body).toEqual({ name: "Quarto", tuyaDeviceId: "abc", kind: "switch", channelCount: 3 });
  expect(onCreated).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("lamp sends null channelCount; failure toasts", async () => {
  m = mockTuyaFetch({ "POST /api/tuya/devices": fail });
  const { onCreated } = setup();
  type("Nome", "A");
  type("Device ID (Tuya)", "b");
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Falha ao cadastrar o dispositivo");
  expect(m.calls[0]!.body.channelCount).toBeNull();
  expect(onCreated).not.toHaveBeenCalled();
});

test("cancel closes", () => {
  m = mockTuyaFetch({});
  const { onClose } = setup();
  fireEvent.click(btn("Cancelar"));
  expect(onClose).toHaveBeenCalled();
});
