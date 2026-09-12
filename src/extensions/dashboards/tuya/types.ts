export type ProtocolVersion = "3.1" | "3.3" | "3.4" | "3.5";
export type BulbType = "A" | "B" | "C";
export type WorkMode = "white" | "colour" | "scene" | "music";

export interface DeviceState {
    online: boolean;
    /** Which path answered: the LAN, or the Tuya cloud as a fallback. */
    transport?: "local" | "cloud";
    power: boolean | null;
    brightness: number | null;
    colorTemp: number | null;
    colorHex: string | null;
    workMode: WorkMode | null;
    channels: Record<string, boolean> | null;
}

export type DeviceKind = "lamp" | "switch";

export interface Device {
    id: string;
    name: string;
    tuyaDeviceId: string;
    ip: string | null;
    protocolVersion: ProtocolVersion | null;
    kind: DeviceKind;
    bulbType: BulbType | null;
    channelCount: number | null;
    enabled: boolean;
    hidden: boolean;
    online: boolean;
    lastSeenAt: string | null;
    createdAt: string;
    state: DeviceState;
}

export interface DiscoveredDevice {
    deviceId: string;
    ip: string;
    version: ProtocolVersion | null;
    productKey: string | null;
    active: boolean;
}

export interface HistoryPoint {
    id: string;
    online: boolean;
    power: boolean | null;
    brightness: number | null;
    colorTemp: number | null;
    colorHex: string | null;
    workMode: string | null;
    recordedAt: string;
}

export interface DeviceCommand {
    power?: boolean;
    brightness?: number;
    colorTemp?: number;
    colorHex?: string;
    workMode?: WorkMode;
    channels?: Record<string, boolean>;
}

export type SensorKind = "temperature_humidity" | "door" | "motion" | "unknown";

export interface Sensor {
    id: string;
    name: string;
    tuyaDeviceId: string;
    kind: SensorKind;
    category: string | null;
    online: boolean;
    enabled: boolean;
    hidden: boolean;
    lastEventAt: string | null;
    lastSeenAt: string | null;
    readings: Record<string, string>;
}

export interface SensorReading {
    id: string;
    code: string;
    value: string;
    recordedAt: string;
}
