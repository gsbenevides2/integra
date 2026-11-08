import React, { useCallback, useEffect, useState } from "react";

import { TRAIN_LINES } from "@server/modules/train-status/model";
import {
  StatusHistoryModal,
  type StatusVisual,
} from "@public/components/StatusHistory";
import { useToast } from "@public/components/Toast";

import { getTrainStatusEdenClient } from "../../client";
import type { TrainLineStatus } from "../../types";

interface StatusCheck {
  status: TrainLineStatus;
  situation: string;
  description: string | null;
  checkedAt: string | Date;
}

interface StatusSegment {
  status: TrainLineStatus;
  situation: string;
  startedAt: string;
  endedAt: string | null;
  description: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lineCode?: number;
}

const VISUALS: Record<TrainLineStatus, StatusVisual> = {
  OK: {
    label: "Operacional",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500/80",
    text: "text-emerald-300",
    ring: "ring-emerald-500/15",
  },
  WARNING: {
    label: "Atenção",
    dot: "bg-amber-500",
    bar: "bg-amber-500/80",
    text: "text-amber-300",
    ring: "ring-amber-500/15",
  },
  CRITICAL: {
    label: "Crítico",
    dot: "bg-rose-500",
    bar: "bg-rose-500/80",
    text: "text-rose-300",
    ring: "ring-rose-500/15",
  },
  UNKNOWN: {
    label: "Desconhecido",
    dot: "bg-gray-500",
    bar: "bg-gray-500/80",
    text: "text-gray-300",
    ring: "ring-gray-500/15",
  },
};

const HEALTHY_STATUSES = ["OK"];

export function HistoryModal({ isOpen, onClose, lineCode }: Props) {
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
      if (lineCode === undefined) return;
      setIsLoading(true);
      const client = getTrainStatusEdenClient();
      const { data, error } = await client.api["train-status"]({
        code: String(lineCode),
      }).history.get({ query: before ? { before } : {} });
      if (error) {
        showToast("Falha ao buscar histórico", "error");
      } else if (data) {
        setChecks(data.checks as unknown as StatusCheck[]);
        setSegments(data.segments as unknown as StatusSegment[]);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      }
      setIsLoading(false);
    },
    [lineCode, showToast],
  );

  useEffect(() => {
    if (!isOpen || lineCode === undefined) return;
    setCursorStack([]);
    setCurrentBefore(undefined);
    setChecks([]);
    setSegments([]);
    setHasMore(false);
    setNextCursor(null);
    fetchHistory(undefined);
  }, [isOpen, lineCode, fetchHistory]);

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

  const line = TRAIN_LINES.find((item) => item.code === lineCode);

  return (
    <StatusHistoryModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Histórico - Linha ${lineCode ?? ""}`}
      subtitle={line?.color}
      subtitleDot={line?.cssColor}
      isLoading={isLoading}
      checks={checks}
      segments={segments}
      visuals={VISUALS}
      healthyStatuses={HEALTHY_STATUSES}
      availabilityLabel="Operacional"
      hasMore={hasMore}
      isLatest={cursorStack.length === 0}
      onGoOlder={goOlder}
      onGoNewer={goNewer}
    />
  );
}
