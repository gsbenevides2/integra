import React from "react";

import { ApplyPresetModal } from "@public/dashboards/tuya/component/ApplyPresetModal/index";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { fail, mockTuyaFetch } from "../../../../../helpers/tuya-fetch";
import { btn, device, preset } from "../../../../../helpers/tuya-fixtures";
import { renderTuya } from "../../../../../helpers/tuya-render";

let m: ReturnType<typeof mockTuyaFetch>;
afterEach(() => {
  cleanup();
  m?.restore();
});

const devices = [device({ id: "a", name: "A" }), device({ id: "b", name: "B" })];

test("applies to the chosen lamp", async () => {
  m = mockTuyaFetch({ "POST /api/tuya/presets/p1/apply": () => ({ ok: true }) });
  const onClose = mock(() => {});
  renderTuya(<ApplyPresetModal preset={preset()} devices={devices} onClose={onClose} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
  fireEvent.click(screen.getByText("Aplicar"));
  await screen.findByText('"Leitura" aplicado');
  expect(m.calls[0]!.body).toEqual({ deviceId: "b" });
  expect(onClose).toHaveBeenCalled();
});

test("failure toasts and cancel closes", async () => {
  m = mockTuyaFetch({ "POST /api/tuya/presets/p1/apply": fail });
  const onClose = mock(() => {});
  renderTuya(<ApplyPresetModal preset={preset()} devices={devices} onClose={onClose} />);
  fireEvent.click(screen.getByText("Aplicar"));
  await screen.findByText('Falha ao aplicar "Leitura"');
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(btn("Cancelar"));
  expect(onClose).toHaveBeenCalled();
});

test("no preset or no devices does nothing", async () => {
  m = mockTuyaFetch({});
  renderTuya(<ApplyPresetModal preset={null} devices={[]} onClose={() => {}} />);
  expect(screen.getByText("Nenhuma lâmpada cadastrada")).toBeTruthy();
  const apply = screen.getByText("Aplicar") as HTMLButtonElement;
  expect(apply.disabled).toBe(true);
  expect(m.calls.length).toBe(0);
});

test("apply with no preset selected is a no-op even if clicked via enabled state", async () => {
  m = mockTuyaFetch({});
  renderTuya(<ApplyPresetModal preset={null} devices={devices} onClose={() => {}} />);
  fireEvent.click(screen.getByText("Aplicar"));
  await new Promise((r) => setTimeout(r, 0));
  expect(m.calls.length).toBe(0);
});
