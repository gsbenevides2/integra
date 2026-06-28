import type { TriggerSettings, Trigger } from "triggers";

export interface HttpSettings extends TriggerSettings {}

export interface HttpTrigger extends Trigger {}

export const REQUEST_ID_HEADER = "X-Request-ID".toLowerCase();

export type MemoryRouteKey = `${string}-${string}`;

export type ElysiaRouteMemory = Map<MemoryRouteKey, string>;
