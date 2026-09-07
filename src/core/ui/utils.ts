import { existsSync } from "node:fs";
import { join } from "node:path";

export function getAssetsPath(): string {
    const candidates = [join(import.meta.dir, "../assets"), join(process.cwd(), "assets")];
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    return candidates[0] ?? "";
}
