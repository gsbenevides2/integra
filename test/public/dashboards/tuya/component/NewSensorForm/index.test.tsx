import React from "react";

import { NewSensorForm } from "@public/dashboards/tuya/component/NewSensorForm/index";

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
  renderTuya(<NewSensorForm isOpen onCreated={onCreated} onClose={onClose} />);
  return { onCreated, onClose };
}
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });

test("validates", async () => {
  m = mockTuyaFetch({});
  setup();
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Preencha nome e device ID");
});

test("success", async () => {
  m = mockTuyaFetch({ "POST /api/tuya/sensors": () => ({ id: "s" }) });
  const { onCreated, onClose } = setup();
  type("Nome", "Porta");
  type("Device ID (Tuya)", "xyz");
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Sensor cadastrado");
  expect(m.calls[0]!.body).toEqual({ name: "Porta", tuyaDeviceId: "xyz" });
  expect(onCreated).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("failure and cancel", async () => {
  m = mockTuyaFetch({ "POST /api/tuya/sensors": fail });
  const { onClose } = setup();
  type("Nome", "Porta");
  type("Device ID (Tuya)", "xyz");
  fireEvent.click(screen.getByText("Cadastrar"));
  await screen.findByText("Falha ao cadastrar o sensor");
  fireEvent.click(btn("Cancelar"));
  expect(onClose).toHaveBeenCalled();
});
