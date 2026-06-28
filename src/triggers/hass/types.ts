import type { instanceSettings } from "./instances";

export interface InstanceSetting {
    url: string;
    token: string;
}

export type InstancesSettings = Record<string, InstanceSetting>;
export type InstanceKey = keyof typeof instanceSettings;