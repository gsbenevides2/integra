export function normalizeMac(mac: string): string {
    return mac.toUpperCase().replace(/[^0-9A-F]/g, "");
}
