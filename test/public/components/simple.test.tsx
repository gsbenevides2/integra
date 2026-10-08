import React from "react";

import { Button } from "@public/components/Button";
import { IconButton } from "@public/components/IconButton";
import { Input } from "@public/components/Input";
import { Modal } from "@public/components/Modal";
import { Select } from "@public/components/Select";
import { Switch } from "@public/components/Switch";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

afterEach(cleanup);

describe("Button", () => {
  test("variants, loading, click", () => {
    const onClick = mock();
    const { rerender } = render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByText("Go"));
    expect(onClick).toHaveBeenCalled();
    rerender(<Button variant="secondary" isLoading>Go</Button>);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });
});

test("IconButton default and custom class", () => {
  const { rerender } = render(<IconButton aria-label="a" />);
  expect(screen.getByLabelText("a").className).toContain("hover:bg-gray-700");
  rerender(<IconButton aria-label="a" className="x" />);
  expect(screen.getByLabelText("a").className).toContain("x");
});

test("Input with and without label", () => {
  const { rerender } = render(<Input id="i" label="Lbl" />);
  expect(screen.getByLabelText("Lbl")).toBeTruthy();
  rerender(<Input id="i" />);
  expect(screen.queryByText("Lbl")).toBeNull();
});

test("Select with and without label/placeholder", () => {
  const options = [{ label: "A", value: "a" }];
  const { rerender } = render(
    <Select id="s" label="Lbl" placeholder="Pick" options={options} defaultValue="" />,
  );
  expect(screen.getByText("Pick")).toBeTruthy();
  expect(screen.getByText("A")).toBeTruthy();
  rerender(<Select id="s" options={options} />);
  expect(screen.queryByText("Lbl")).toBeNull();
});

test("Switch toggles and respects label/disabled", () => {
  const onChange = mock();
  const { rerender } = render(<Switch checked={false} onChange={onChange} label="L" />);
  fireEvent.click(screen.getByRole("switch"));
  expect(onChange).toHaveBeenCalledWith(true);
  rerender(<Switch checked disabled onChange={onChange} />);
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  expect(screen.queryByText("L")).toBeNull();
});

test("Modal portals after mount and closes on backdrop only", () => {
  const onClose = mock();
  const { rerender } = render(
    <Modal isOpen onClose={onClose} title="T">body</Modal>,
  );
  expect(screen.getByText("body")).toBeTruthy();
  fireEvent.click(screen.getByText("body"));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("T").parentElement!.parentElement!);
  expect(onClose).toHaveBeenCalledTimes(1);
  rerender(<Modal isOpen={false} onClose={onClose} title="T">body</Modal>);
  act(() => {});
});
