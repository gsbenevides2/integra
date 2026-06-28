import Elysia from "elysia";
import type { TriggerSettings, Trigger } from "triggers";

export interface HttpSettings extends TriggerSettings {}

export interface HttpTrigger extends Trigger {}

export const CreateTypedElysia = () =>
    new Elysia().decorate("triggerId", "").derive(() => ({ traceId: crypto.randomUUID() }));

export type TypedElysia = ReturnType<typeof CreateTypedElysia>;

export const TypedElysia = () =>
    new Elysia().derive(() => ({ traceId: crypto.randomUUID() })) as unknown as TypedElysia;
