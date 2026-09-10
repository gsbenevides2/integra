export type TrainLineStatus = "OK" | "WARNING" | "CRITICAL" | "UNKNOWN";

export interface StatusCheck {
    status: TrainLineStatus;
    situation: string;
    description: string | null;
    checkedAt: Date;
}

export interface StatusSegment {
    status: TrainLineStatus;
    situation: string;
    startedAt: string;
    endedAt: string | null;
    description: string | null;
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
                situation: check.situation,
                startedAt: check.checkedAt.toISOString(),
                endedAt: null,
                description: check.description,
            });
        }
    }
    return segments;
}
