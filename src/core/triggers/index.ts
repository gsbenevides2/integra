export interface TriggerSettings {
    id: string;
}
export interface Trigger {
    id: string;
    type?: string;
    register: () => Promise<void>;
    test?: () => Promise<void>;
}
