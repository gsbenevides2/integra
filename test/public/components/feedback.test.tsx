import React from "react";

import { useConfirm } from "@public/components/Confirm";
import { useConfirmState } from "@public/components/ConfirmContext";
import { useToast } from "@public/components/Toast";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { renderWithProviders } from "../../helpers/public-render";

afterEach(cleanup);

describe("toast", () => {
  test("show, auto dismiss via timer, manual dismiss", () => {
    const realSet = globalThis.setTimeout;
    let fire: (() => void) | undefined;
    const spy = spyOn(globalThis, "setTimeout").mockImplementation(((fn: any, ms?: number, ...a: any[]) => {
      if (ms === 4000) {
        fire = fn;
        return 0 as any;
      }
      return realSet(fn, ms, ...a);
    }) as any);
    function Trigger() {
      const t = useToast();
      return (
        <>
          <button onClick={() => t.showToast("ok msg", "success")}>s</button>
          <button onClick={() => t.showToast("bad msg", "error")}>e</button>
        </>
      );
    }
    renderWithProviders(<Trigger />);
    fireEvent.click(screen.getByText("s"));
    fireEvent.click(screen.getByText("e"));
    expect(screen.getByText("ok msg")).toBeTruthy();
    expect(screen.getByText("bad msg")).toBeTruthy();
    act(() => fire!());
    expect(screen.queryByText("bad msg")).toBeNull();
    fireEvent.click(screen.getByText("ok msg").parentElement!.querySelector("button")!);
    expect(screen.queryByText("ok msg")).toBeNull();
    spy.mockRestore();
  });

  test("useToast outside provider throws", () => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    function Bad() {
      useToast();
      return null;
    }
    expect(() => render(<Bad />)).toThrow("ToastProvider");
    err.mockRestore();
  });
});

describe("confirm", () => {
  function Ask({ opts, onResult }: { opts: any; onResult: (v: boolean) => void }) {
    const confirm = useConfirm();
    return <button onClick={() => confirm(opts).then(onResult)}>ask</button>;
  }

  test("defaults, confirm and cancel and backdrop", async () => {
    const onResult = mock();
    renderWithProviders(<Ask opts={{ message: "sure?" }} onResult={onResult} />);
    fireEvent.click(screen.getByText("ask"));
    expect(screen.getByText("Confirmar ação")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText("Confirmar")));
    expect(onResult).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText("ask"));
    await act(async () => fireEvent.click(screen.getByText("Cancelar")));
    expect(onResult).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByText("ask"));
    const backdrop = screen.getByText("sure?").closest(".fixed")!;
    await act(async () => fireEvent.click(screen.getByText("sure?")));
    expect(onResult).toHaveBeenCalledTimes(2);
    await act(async () => fireEvent.click(backdrop));
    expect(onResult).toHaveBeenCalledTimes(3);
  });

  test("custom labels", () => {
    renderWithProviders(
      <Ask opts={{ title: "T", message: "m", confirmLabel: "Yes", cancelLabel: "No" }} onResult={() => {}} />,
    );
    fireEvent.click(screen.getByText("ask"));
    expect(screen.getByText("T")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
  });

  test("resolve with no pending promise is harmless; hooks throw outside provider", () => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    function Bad1() {
      useConfirm();
      return null;
    }
    function Bad2() {
      useConfirmState();
      return null;
    }
    expect(() => render(<Bad1 />)).toThrow("ConfirmProvider");
    expect(() => render(<Bad2 />)).toThrow("ConfirmProvider");
    err.mockRestore();
    renderWithProviders(<div />);
    fireEvent.click(screen.getByText("Cancelar"));
  });
});
