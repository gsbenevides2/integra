export interface DEV2_ADT_WAN {
    connIPv4Address: string;
    connStatusV4: string;
    X_TP_Uptime: string;
    X_TP_BytesReceived: string;
    X_TP_BytesSent: string;
    stack: string;
}

export interface DEV2_DEV_INFO {
    upTime: string;
    softwareVersion: string;
    hardwareVersion: string;
    stack: string;
}

export interface DEV2_MEM_STATUS {
    total: string;
    free: string;
    stack: string;
}

export interface DEV2_PROC_STATUS {
    CPUUsage: string;
    stack: string;
}

export interface DEV2_WIFI_APDEV {
    MACAddress: string;
    X_TP_IPAddress: string;
    backhaulLinkType: string;
    X_TP_HostName: string;
    X_TP_Active: string;
}

export interface DEV2_WIFI_APDEV_ASSOCDEV {
    X_TP_HostName: string;
    X_TP_RadioMac: string;
    X_TP_IPAddress: string;
    MACAddress: string;
    active: string;
}

export interface DEV2_WIFI_APDEV_RADIO {
    channel: string;
    operatingFrequencyBand: string;
    MACAddress: string;
}

export interface DEV2_WIFI_APDEV_ETHASSOCDEV {
    IPAddress: string;
    X_TP_HostName: string;
    MACAddress: string;
    active: string;
}

export interface DEV2_DHCPV4_POOL_STATICADDR {
    yiaddr: string;
    chaddr: string;
    stack: string;
}

export interface DEV2_FW_CHAIN {
    name: string;
    enable: string;
    ruleNumberOfEntries: string;
    stack: string;
}

export interface DEV2_FW_CHAIN_RULE {
    X_TP_RuleName: string;
    X_TP_RuleType: string;
    X_TP_SourceType: string;
    sourceIP: string;
    X_TP_SourceMACAddress: string;
    target: string;
    enable: string;
    stack: string;
}

export type ConnectedDevices = {
    mac: string;
    ip: string;
    vendor: string;
    name: string;
    routerInterface: string;
}[];

export type DhcpEntries = {
    entryId: string;
    mac: string;
    ip: string;
}[];
