export interface StatusCheck {
    status: "OK" | "DOWN";
    problemDescription: string | null;
    checkedAt: Date;
}

export interface StatusSegment {
    status: "OK" | "DOWN";
    startedAt: string;
    endedAt: string | null;
    problemDescription: string | null;
}

export function buildSegments(checks: StatusCheck[]): StatusSegment[] {
    const segments: StatusSegment[] = [];
    for (const check of checks) {
        const current = segments.at(-1);
        if (!current || current.status !== check.status) {
            if (current) {
                current.endedAt = check.checkedAt.toISOString();
            }
            segments.push({
                status: check.status,
                startedAt: check.checkedAt.toISOString(),
                endedAt: null,
                problemDescription: check.problemDescription,
            });
        }
    }
    return segments;
}
