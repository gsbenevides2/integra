import React, { useCallback, useEffect, useState } from "react";

import {
  StatusHistoryModal,
  type StatusVisual,
} from "@public/components/StatusHistory";
import { useToast } from "@public/components/Toast";

import { getStatusPlatformEdenClient } from "../../client";

interface StatusCheck {
  status: "OK" | "DOWN";
  problemDescription: string | null;
  checkedAt: string | Date;
}

interface StatusSegment {
  status: "OK" | "DOWN";
  startedAt: string;
  endedAt: string | null;
  problemDescription: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  platformId?: string;
  platformName?: string;
  platformUrl?: string;
}

const VISUALS: Record<"OK" | "DOWN", StatusVisual> = {
  OK: {
    label: "Operacional",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500/80",
    text: "text-emerald-300",
    ring: "ring-emerald-500/15",
  },
  DOWN: {
    label: "Fora do ar",
    dot: "bg-rose-500",
    bar: "bg-rose-500/80",
    text: "text-rose-300",
    ring: "ring-rose-500/15",
  },
};

const HEALTHY_STATUSES = ["OK"];

export function HistoryModal({
  isOpen,
  onClose,
  platformId,
  platformName,
  platformUrl,
}: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [checks, setChecks] = useState<StatusCheck[]>([]);
  const [segments, setSegments] = useState<StatusSegment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([]);
  const [currentBefore, setCurrentBefore] = useState<string>();
  const { showToast } = useToast();

  const fetchHistory = useCallback(
    async (before?: string) => {
      if (!platformId) return;
      setIsLoading(true);
      const { data, error } = await getStatusPlatformEdenClient()
        .api["status-platform"]({ id: platformId })
        .history.get({ query: before ? { before } : {} });
      if (error) {
        showToast("Falha ao buscar histórico", "error");
      } else if (data) {
        setChecks(data.checks);
        setSegments(data.segments);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      }
      setIsLoading(false);
    },
    [platformId, showToast],
  );

  useEffect(() => {
    if (!isOpen || !platformId) return;
    setCursorStack([]);
    setCurrentBefore(undefined);
    setChecks([]);
    setSegments([]);
    setHasMore(false);
    setNextCursor(null);
    fetchHistory(undefined);
  }, [isOpen, platformId, fetchHistory]);

  const goOlder = useCallback(() => {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, currentBefore]);
    setCurrentBefore(nextCursor);
    fetchHistory(nextCursor);
  }, [nextCursor, currentBefore, fetchHistory]);

  const goNewer = useCallback(() => {
    setCursorStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setCurrentBefore(previous);
      fetchHistory(previous);
      return stack.slice(0, -1);
    });
  }, [fetchHistory]);

  return (
    <StatusHistoryModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Histórico - ${platformName ?? ""}`}
      subtitle={platformUrl}
      isLoading={isLoading}
      checks={checks}
      segments={segments.map((segment) => ({
        status: segment.status,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        description: segment.problemDescription,
      }))}
      visuals={VISUALS}
      healthyStatuses={HEALTHY_STATUSES}
      hasMore={hasMore}
      isLatest={cursorStack.length === 0}
      onGoOlder={goOlder}
      onGoNewer={goNewer}
    />
  );
}
