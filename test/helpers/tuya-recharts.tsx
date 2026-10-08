import React from "react";

import { mock } from "bun:test";

const real = { ...(await import("recharts")) };

const Box = ({ children }: any) => <div>{children}</div>;
const chart = (name: string) => ({ data, children }: any) => (
  <div data-testid={name} data-data={JSON.stringify(data)}>{children}</div>
);
const calls = (fn: any, ...args: unknown[]) => (fn ? String(fn(...args)) : "");

/** Registers a recharts stand-in that renders data and exercises the formatter props. */
export function mockRecharts() {
  mock.module("recharts", () => ({
    ResponsiveContainer: Box,
    AreaChart: chart("area"),
    BarChart: chart("bar"),
    LineChart: chart("line"),
    CartesianGrid: () => null,
    Area: () => null,
    Bar: () => null,
    Line: ({ type }: any) => <i data-testid="line-type">{type}</i>,
    XAxis: ({ tickFormatter }: any) => (
      <i data-testid="x">{calls(tickFormatter, 1_700_000_000_000)}</i>
    ),
    YAxis: ({ tickFormatter }: any) => (
      <i data-testid="y">{tickFormatter ? calls(tickFormatter, 1) : ""}</i>
    ),
    Tooltip: ({ labelFormatter, formatter }: any) => (
      <i data-testid="tip">
        {calls(labelFormatter, 1_700_000_000_000)}|{JSON.stringify(formatter(2, "n"))}
      </i>
    ),
  }));
}

export function restoreRecharts() {
  mock.module("recharts", () => real);
}
