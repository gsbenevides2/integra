import React from "react";

import {
  initialsOf,
  MeProvider,
  useMe,
} from "@public/components/MeContext";
import {
  isAccessDenied,
  PERMISSION_DENIED_MESSAGE,
  PermissionDenied,
} from "@public/components/PermissionDenied";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, spyOn, test } from "bun:test";

import { ME_FIXTURE, renderWithMe } from "../../helpers/me";

afterEach(cleanup);

test("initialsOf handles empty, single and full names", () => {
  expect(initialsOf("")).toBe("?");
  expect(initialsOf("   ")).toBe("?");
  expect(initialsOf("guilherme")).toBe("GU");
  expect(initialsOf("Guilherme da Silva Benevides")).toBe("GB");
});

test("isAccessDenied recognises the Eden and fetch shapes", () => {
  expect(isAccessDenied(null)).toBe(false);
  expect(isAccessDenied("403")).toBe(false);
  expect(isAccessDenied({})).toBe(false);
  expect(isAccessDenied({ status: 403 })).toBe(true);
  expect(isAccessDenied({ value: { status: 403 } })).toBe(true);
  expect(isAccessDenied({ response: { status: 403 } })).toBe(true);
  expect(isAccessDenied({ status: 500 })).toBe(false);
});

test("PermissionDenied renders the neutral message", () => {
  renderWithMe(
    <>
      <PermissionDenied />
      <PermissionDenied label="Lâmpadas" />
    </>,
  );
  expect(screen.getAllByText(PERMISSION_DENIED_MESSAGE)).toHaveLength(2);
  expect(screen.getByText("Lâmpadas")).toBeTruthy();
});

test("useMe defaults to null outside the provider", () => {
  function Probe() {
    return <span>{useMe().me ? "yes" : "no"}</span>;
  }
  render(<Probe />);
  expect(screen.getByText("no")).toBeTruthy();
});

test("MeProvider shows loading, then the app", async () => {
  let release!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => (release = resolve));
  const spy = spyOn(globalThis, "fetch").mockReturnValue(pending as never);
  render(
    <MeProvider>
      <span>app ready</span>
    </MeProvider>,
  );
  expect(screen.getByText("Carregando...")).toBeTruthy();
  await act(async () => {
    release(new Response(JSON.stringify(ME_FIXTURE)));
  });
  expect(screen.getByText("app ready")).toBeTruthy();
  spy.mockRestore();
});

test("MeProvider shows the identity error on 403 and retries", async () => {
  const spy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("no", { status: 403 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(ME_FIXTURE)));
  render(
    <MeProvider>
      <span>app ready</span>
    </MeProvider>,
  );
  expect(await screen.findByText("Não foi possível identificar o usuário")).toBeTruthy();
  fireEvent.click(screen.getByText("Tentar novamente"));
  expect(await screen.findByText("app ready")).toBeTruthy();
  spy.mockRestore();
});

test("MeProvider shows the identity error on a network failure", async () => {
  const spy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  render(
    <MeProvider>
      <span>app ready</span>
    </MeProvider>,
  );
  expect(await screen.findByText("Não foi possível identificar o usuário")).toBeTruthy();
  spy.mockRestore();
  await waitFor(() => expect(screen.queryByText("app ready")).toBeNull());
});
