import React from "react";

import { PresetDrawerContent } from "@public/dashboards/tuya/component/PresetDrawerContent/index";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { fail, mockTuyaFetch } from "../../../../../helpers/tuya-fetch";
import { field, preset } from "../../../../../helpers/tuya-fixtures";
import { renderTuya } from "../../../../../helpers/tuya-render";

let m: ReturnType<typeof mockTuyaFetch>;
afterEach(() => {
  cleanup();
  m?.restore();
});

function setup() {
  const onChanged = mock(() => {});
  const onDeleted = mock(() => {});
  const view = renderTuya(<PresetDrawerContent preset={preset()} onChanged={onChanged} onDeleted={onDeleted} />);
  return { onChanged, onDeleted, view };
}
const confirmBtn = (t: string) => screen.getAllByText(t).find((e) => e.closest(".max-w-sm"))!;

test("save success then failure", async () => {
  m = mockTuyaFetch({ "PUT /api/tuya/presets/p1": () => ({ ok: 1 }) });
  const { onChanged } = setup();
  fireEvent.change(field("Nome"), { target: { value: "Novo" } });
  fireEvent.click(screen.getByText("Salvar"));
  await screen.findByText("Modo salvo");
  expect(m.calls[0]!.body.name).toBe("Novo");
  expect(onChanged).toHaveBeenCalled();
  m.restore();
  m = mockTuyaFetch({ "PUT /api/tuya/presets/p1": fail });
  fireEvent.click(screen.getByText("Salvar"));
  await screen.findByText("Falha ao salvar o modo");
});

test("remove: declined, failure, success", async () => {
  m = mockTuyaFetch({ "DELETE /api/tuya/presets/p1": fail });
  const { onDeleted } = setup();
  fireEvent.click(screen.getByText("Remover"));
  await screen.findByText('Remover o modo "Leitura"?');
  fireEvent.click(confirmBtn("Cancelar"));
  await new Promise((r) => setTimeout(r, 0));
  expect(m.calls.length).toBe(0);

  fireEvent.click(screen.getByText("Remover"));
  fireEvent.click(confirmBtn("Confirmar"));
  await screen.findByText("Falha ao remover o modo");

  m.restore();
  m = mockTuyaFetch({ "DELETE /api/tuya/presets/p1": () => ({ ok: 1 }) });
  fireEvent.click(screen.getByText("Remover"));
  fireEvent.click(confirmBtn("Confirmar"));
  await screen.findByText("Modo removido");
  expect(onDeleted).toHaveBeenCalled();
});
