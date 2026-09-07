import type { brokerSettings } from "./brokers";

export interface BrokerSetting {
    url: string;
    username?: string;
    password?: string;
}

export type BrokersSettings = Record<string, BrokerSetting>;
export type BrokerKey = keyof typeof brokerSettings;
