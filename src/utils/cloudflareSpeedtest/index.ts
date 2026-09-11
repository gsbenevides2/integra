const DOWNLOAD_URL = "https://speed.cloudflare.com/__down";
const UPLOAD_URL = "https://speed.cloudflare.com/__up";

const LATENCY_SAMPLES = 5;
const DOWNLOAD_BYTES = 1e7; // 10 MB
const UPLOAD_BYTES = 5e6; // 5 MB

export interface CloudflareSpeedtestResult {
    downloadMbps: number;
    uploadMbps: number;
    latencyMs: number;
}

function median(values: number[]): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
        : (sorted[mid] ?? 0);
}

async function measureLatencyMs(): Promise<number> {
    const samples: number[] = [];
    for (let i = 0; i < LATENCY_SAMPLES; i++) {
        const start = performance.now();
        const res = await fetch(`${DOWNLOAD_URL}?bytes=0`);
        await res.arrayBuffer();
        samples.push(performance.now() - start);
    }
    return median(samples);
}

async function measureDownloadMbps(): Promise<number> {
    const start = performance.now();
    const res = await fetch(`${DOWNLOAD_URL}?bytes=${DOWNLOAD_BYTES}`);
    const buffer = await res.arrayBuffer();
    const elapsedSeconds = (performance.now() - start) / 1000;
    return (buffer.byteLength * 8) / elapsedSeconds / 1e6;
}

async function measureUploadMbps(): Promise<number> {
    const body = new Uint8Array(UPLOAD_BYTES);
    const start = performance.now();
    const res = await fetch(UPLOAD_URL, { method: "POST", body });
    await res.arrayBuffer();
    const elapsedSeconds = (performance.now() - start) / 1000;
    return (UPLOAD_BYTES * 8) / elapsedSeconds / 1e6;
}

export async function runCloudflareSpeedtest(): Promise<CloudflareSpeedtestResult> {
    const latencyMs = await measureLatencyMs();
    const downloadMbps = await measureDownloadMbps();
    const uploadMbps = await measureUploadMbps();
    return { downloadMbps, uploadMbps, latencyMs };
}
