import type { instanceSettings } from "./instances";

export interface InstanceSetting {
    host: string;
    token: string;
    useTLS?: boolean;
}

export type InstancesSettings = Record<string, InstanceSetting>;
export type InstanceKey = keyof typeof instanceSettings;
