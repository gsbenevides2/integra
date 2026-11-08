import React, { useEffect, useRef, useState } from "react";

import { IconButton } from "@public/components/IconButton";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

/** Tailwind classes for one status: label, dot and timeline bar. */
export interface StatusVisual {
  label: string;
  dot: string;
  bar: string;
  text: string;
  ring?: string;
}

export interface HistorySegment {
  status: string;
  startedAt: string;
  endedAt: string | null;
  description?: string | null;
  situation?: string | null;
}

export interface HistoryCheck {
  checkedAt: string | Date;
}

export interface StatusHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  subtitleDot?: string;
  isLoading: boolean;
  checks: HistoryCheck[];
  segments: HistorySegment[];
  visuals: Record<string, StatusVisual>;
  /** Statuses that count as healthy when computing availability. */
  healthyStatuses: string[];
  /** Copy for the availability card (e.g. "Disponibilidade" / "Operacional"). */
  availabilityLabel?: string;
  hasMore: boolean;
  /** False while browsing an older page: its last segment is cut, not ongoing. */
  isLatest: boolean;
  onGoOlder: () => void;
  onGoNewer: () => void;
}

const FALLBACK_VISUAL: StatusVisual = {
  label: "Desconhecido",
  dot: "bg-gray-500",
  bar: "bg-gray-600",
  text: "text-gray-300",
  ring: "ring-gray-500/20",
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateTime(
  value: string | number | Date,
  { withYear = false, withSeconds = false } = {},
): string {
  const date = new Date(value);
  const datePart = withYear
    ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
    : `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  const timePart = withSeconds
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${datePart} ${timePart}`;
}

export function formatClock(value: string | number | Date): string {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Compact duration: 30s, 4min, 3h, 2d. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Descriptive duration for summaries: 30s, 4min, 3h 20min, 2d 4h. */
export function formatDurationLong(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest > 0 ? `${hours}h ${rest}min` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
}

export function formatPercent(value: number): string {
  const percent = (Math.round(value * 1000) / 10).toFixed(1).replace(/\.0$/, "");
  return `${percent.replace(".", ",")}%`;
}

function availabilityTone(availability: number): string {
  return availability >= 0.9 ? "text-emerald-300" : "text-rose-300";
}

export function formatRange(checks: HistoryCheck[]): string {
  const first = checks[0];
  const last = checks.at(-1);
  if (!first || !last) return "Sem verificações";
  return `${formatDateTime(first.checkedAt)} – ${formatDateTime(last.checkedAt)}`;
}

function segmentDuration(segment: HistorySegment, fallbackEnd: number): number {
  const startedAt = new Date(segment.startedAt).getTime();
  const endedAt = segment.endedAt
    ? new Date(segment.endedAt).getTime()
    : fallbackEnd;
  return Math.max(0, endedAt - startedAt);
}

interface Summary {
  total: number;
  availability: number;
  incidents: number;
  durations: number[];
  byStatus: Map<string, number>;
}

function summarize(
  segments: HistorySegment[],
  healthyStatuses: string[],
  pageEnd: number,
): Summary {
  const durations = segments.map((segment) =>
    segmentDuration(segment, pageEnd),
  );
  const total = durations.reduce((sum, value) => sum + value, 0);
  const healthy = segments.reduce(
    (sum, segment, index) =>
      sum + (healthyStatuses.includes(segment.status) ? durations[index]! : 0),
    0,
  );
  const byStatus = new Map<string, number>();
  segments.forEach((segment, index) => {
    byStatus.set(
      segment.status,
      (byStatus.get(segment.status) ?? 0) + durations[index]!,
    );
  });
  return {
    total,
    availability: total > 0 ? healthy / total : 0,
    incidents: segments.filter(
      (segment) => !healthyStatuses.includes(segment.status),
    ).length,
    durations,
    byStatus,
  };
}

function Stat({
  label,
  value,
  hint,
  tone = "text-mist-100",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="
      rounded-lg border border-gray-700/60 bg-gray-800/60 px-3 py-2
    ">
      <p className="
        text-[10px] font-medium tracking-wider text-mist-500 uppercase
      ">
        {label}
      </p>
      <p className={`
        mt-0.5 text-xl font-semibold tabular-nums
        ${tone}
      `}>
        {value}
      </p>
      <p className="text-[10px] text-mist-500">{hint}</p>
    </div>
  );
}

function StatusTimeline({
  segments,
  visuals,
  durations,
  rangeStart,
  rangeEnd,
  now,
  isLatest,
}: {
  segments: HistorySegment[];
  visuals: Record<string, StatusVisual>;
  durations: number[];
  rangeStart: number;
  rangeEnd: number;
  now: number;
  isLatest: boolean;
}) {
  const midpoint = rangeStart + (rangeEnd - rangeStart) / 2;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex h-11 w-full items-stretch gap-[3px]"
        role="list"
        aria-label="Linha do tempo do status"
      >
        {segments.map((segment, index) => {
          const visual = visuals[segment.status] ?? FALLBACK_VISUAL;
          const duration = durations[index] ?? 0;
          const isLast = index === segments.length - 1;
          const isOngoing = isLast && !segment.endedAt && isLatest;
          const rounded =
            `${index === 0 ? "rounded-l-md" : ""} ${isLast ? "rounded-r-md" : ""}`;
          const until = segment.endedAt
            ? formatClock(segment.endedAt)
            : "agora";
          return (
            <div
              key={`${segment.startedAt}-${index}`}
              role="listitem"
              tabIndex={0}
              aria-label={`${visual.label}: ${formatDuration(duration)}, das ${formatClock(segment.startedAt)} até ${until}`}
              className="
                group relative min-w-[3px] rounded-sm outline-none
                focus-visible:ring-2 focus-visible:ring-white/60
                focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900
              "
              style={{ flexGrow: Math.max(duration, 1), flexBasis: 0 }}
            >
              <div className={`
                size-full
                ${visual.bar}
                ${rounded}
              `} />
              {isOngoing && (
                <span className="
                  pointer-events-none absolute inset-0 animate-pulse
                  rounded-r-md bg-white/10
                " />
              )}
              <span
                className="
                  pointer-events-none absolute bottom-full left-1/2 z-20 mb-2
                  hidden -translate-x-1/2 rounded-md border border-gray-600
                  bg-gray-950 px-2 py-1 text-[11px] whitespace-nowrap shadow-xl
                  group-hover:block
                  group-focus-visible:block
                "
              >
                <span className={`
                  font-medium
                  ${visual.text}
                `}>
                  {visual.label}
                </span>
                <span className="text-mist-400">
                  {" "}
                  · {formatDuration(duration)}
                </span>
                <span className="block text-[10px] text-mist-500">
                  {formatClock(segment.startedAt)} → {until}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="
        flex justify-between text-[10px] text-mist-500 tabular-nums
      ">
        <span>{formatClock(rangeStart)}</span>
        <span>{formatClock(midpoint)}</span>
        <span>{isLatest ? formatClock(now) : formatClock(rangeEnd)}</span>
      </div>
    </div>
  );
}

function StatusLegend({
  visuals,
  byStatus,
  total,
}: {
  visuals: Record<string, StatusVisual>;
  byStatus: Map<string, number>;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {Object.entries(visuals).map(([status, visual]) => {
        const share = total > 0 ? (byStatus.get(status) ?? 0) / total : 0;
        return (
          <span
            key={status}
            className="flex items-center gap-1.5 text-[11px] text-mist-300"
          >
            <span className={`
              size-2 rounded-full
              ${visual.dot}
            `} />
            {visual.label}
            <span className="text-mist-500 tabular-nums">
              {formatPercent(share)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function HistoryRow({
  segment,
  visual,
  duration,
  isLast,
  isLatest,
}: {
  segment: HistorySegment;
  visual: StatusVisual;
  duration: number;
  isLast: boolean;
  isLatest: boolean;
}) {
  const ongoing = isLast && !segment.endedAt && isLatest;
  const openAtPageEdge = isLast && !segment.endedAt && !isLatest;
  const detail = [segment.situation, segment.description]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="
      flex gap-2.5 rounded-lg border border-gray-700/40 bg-gray-800/50 px-3 py-2
    ">
      <span
        className={`
          mt-1.5 size-2 shrink-0 rounded-full
          ${visual.dot}
          ${visual.ring ? `
            ring-4
            ${visual.ring}
          ` : ""}
        `}
      />
      <div className="min-w-0 flex-1">
        <div className="
          flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5
        ">
          <span className={`
            text-sm font-medium
            ${visual.text}
          `}>
            {visual.label}
          </span>
          {openAtPageEdge ? (
            <span className="
              rounded-full bg-gray-700/50 px-1.5 py-0.5 text-[10px]
              text-mist-300
            ">
              em aberto
            </span>
          ) : (
            <span className="
              rounded-full bg-gray-700/50 px-1.5 py-0.5 text-[10px]
              text-mist-200 tabular-nums
            ">
              por {formatDuration(duration)}
            </span>
          )}
        </div>
        <p className="
          mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-mist-400
        ">
          <span>desde {formatDateTime(segment.startedAt)}</span>
          {segment.endedAt && (
            <span>até {formatDateTime(segment.endedAt)}</span>
          )}
          {ongoing && <span className={visual.text}>em andamento</span>}
        </p>
        {detail && (
          <p className="mt-1 line-clamp-2 text-[11px] text-mist-400" title={detail}>
            {detail}
          </p>
        )}
      </div>
    </li>
  );
}

export function StatusHistoryModal({
  isOpen,
  onClose,
  title,
  subtitle,
  subtitleDot,
  isLoading,
  checks,
  segments,
  visuals,
  healthyStatuses,
  availabilityLabel = "Disponibilidade",
  hasMore,
  isLatest,
  onGoOlder,
  onGoNewer,
}: StatusHistoryModalProps) {
  const now = Date.now();
  const lastCheck = checks.at(-1);
  const pageEnd =
    isLatest || !lastCheck ? now : new Date(lastCheck.checkedAt).getTime();
  const summary = summarize(segments, healthyStatuses, pageEnd);
  const current = segments.at(-1);
  const currentVisual = current
    ? visuals[current.status] ?? FALLBACK_VISUAL
    : undefined;
  const rangeStart =
    segments.length > 0 ? new Date(segments[0]!.startedAt).getTime() : now;
  const hasSegments = segments.length > 0;
  const [incidentsOnly, setIncidentsOnly] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const visibleRows = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) =>
      incidentsOnly ? !healthyStatuses.includes(segment.status) : true,
    )
    .reverse();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) setIncidentsOnly(false);
  }, [isOpen]);

  // Move focus into the dialog and give it back when it closes.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, [isOpen]);

  return (
    <div
      inert={!isOpen}
      className={`
        fixed inset-0 z-50 flex items-center justify-center bg-mist-950/90 p-4
        backdrop-blur-sm transition-opacity duration-200
        ${
        isOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }
      `}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isOpen ? title : undefined}
        tabIndex={-1}
        className={`
          flex max-h-[92vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto
          rounded-xl bg-gray-900 p-4 shadow-2xl ring-1 ring-gray-700/60
          transition-all duration-200 outline-none
          ${isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"}
        `}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold">{title}</h3>
              {isLatest && currentVisual && (
                <span
                  className={`
                    inline-flex items-center gap-1.5 rounded-full bg-gray-800/80
                    px-2 py-0.5 text-[11px] font-medium ring-1 ring-gray-700
                    ring-inset
                    ${currentVisual.text}
                  `}
                >
                  <span
                    className={`
                      size-1.5 rounded-full
                      ${currentVisual.dot}
                    `}
                  />
                  {currentVisual.label}
                </span>
              )}
              {!isLatest && hasSegments && (
                <span className="
                  inline-flex items-center gap-1.5 rounded-full bg-gray-800/80
                  px-2 py-0.5 text-[11px] font-medium text-mist-300 ring-1
                  ring-gray-700 ring-inset
                ">
                  Período anterior
                </span>
              )}
            </div>
            {subtitle && (
              <p
                className="mt-1 truncate text-xs text-mist-400"
                title={subtitle}
              >
                {subtitleDot && (
                  <span
                    className="
                      mr-1.5 inline-block size-2 rounded-full align-middle
                    "
                    style={{ backgroundColor: subtitleDot }}
                  />
                )}
                {subtitle}
              </p>
            )}
          </div>
          <IconButton
            type="button"
            onClick={onClose}
            aria-label="Fechar histórico"
          >
            <XMarkIcon className="size-4.5" />
          </IconButton>
        </header>

        <div
          className={`
            flex items-center justify-between gap-2 rounded-lg border
            border-gray-700/60 bg-gray-800/40 px-1.5 py-1
          `}
        >
          <IconButton
            type="button"
            onClick={onGoNewer}
            disabled={isLatest}
            className="
              hover:bg-gray-700
              disabled:opacity-30
            "
            aria-label="Período mais recente"
          >
            <ChevronLeftIcon className="size-4.5" />
          </IconButton>
          <div className="min-w-0 text-center">
            <p className="
              text-[10px] font-medium tracking-wider text-mist-500 uppercase
            ">
              Período
            </p>
            <p className="truncate text-xs text-mist-300 tabular-nums">
              {formatRange(checks)}
            </p>
          </div>
          <IconButton
            type="button"
            onClick={onGoOlder}
            disabled={!hasMore}
            className="
              hover:bg-gray-700
              disabled:opacity-30
            "
            aria-label="Período mais antigo"
          >
            <ChevronRightIcon className="size-4.5" />
          </IconButton>
        </div>

        {isLoading ? (
          <div className="
            flex h-64 flex-col items-center justify-center gap-3 text-sm
            text-mist-400
          ">
            <span className="
              size-5 animate-spin rounded-full border-2 border-gray-700
              border-t-emerald-400
            " />
            Carregando histórico...
          </div>
        ) : !hasSegments ? (
          <div className="
            flex h-64 flex-col items-center justify-center gap-2 text-sm
            text-mist-400
          ">
            <ClockIcon className="size-8 text-mist-600" />
            Nenhum histórico disponível para este período.
          </div>
        ) : (
          <>
            <div className="
              grid grid-cols-2 gap-2
              sm:grid-cols-3
            ">
              <Stat
                label={availabilityLabel}
                value={formatPercent(summary.availability)}
                hint="do tempo monitorado"
                tone={availabilityTone(summary.availability)}
              />
              <Stat
                label="Tempo monitorado"
                value={formatDurationLong(summary.total)}
                hint="neste período"
              />
              <Stat
                label="Intercorrências"
                value={String(summary.incidents)}
                hint={
                  summary.incidents === 1 ? "trecho afetado" : "trechos afetados"
                }
                tone={
                  summary.incidents > 0 ? "text-amber-300" : "text-emerald-300"
                }
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="
                  text-[10px] font-medium tracking-wider text-mist-500 uppercase
                ">
                  Linha do tempo
                </h4>
                <StatusLegend
                  visuals={visuals}
                  byStatus={summary.byStatus}
                  total={summary.total}
                />
              </div>
              <StatusTimeline
                segments={segments}
                visuals={visuals}
                durations={summary.durations}
                rangeStart={rangeStart}
                rangeEnd={pageEnd}
                now={now}
                isLatest={isLatest}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="
                  text-[10px] font-medium tracking-wider text-mist-500 uppercase
                ">
                  Histórico detalhado
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={incidentsOnly}
                    onClick={() => setIncidentsOnly((value) => !value)}
                    className={`
                      inline-flex cursor-pointer items-center gap-1.5
                      rounded-full border px-2 py-0.5 text-[11px] font-medium
                      transition-colors
                      ${
                      incidentsOnly
                        ? `border-amber-500/40 bg-amber-500/10 text-amber-200`
                        : `
                          border-gray-700 bg-gray-800/60 text-mist-300
                          hover:bg-gray-700/60
                        `
                    }
                    `}
                  >
                    <span
                      className={`
                        size-1.5 rounded-full
                        ${incidentsOnly ? "bg-amber-400" : "bg-gray-500"}
                      `}
                    />
                    Só intercorrências
                  </button>
                  <span className="text-[11px] text-mist-500">
                    {visibleRows.length} registro
                    {visibleRows.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              {visibleRows.length === 0 ? (
                <p className="
                  rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3
                  py-6 text-center text-sm text-emerald-200
                ">
                  Nenhuma intercorrência neste período.
                </p>
              ) : (
                <ul className="
                  flex max-h-[36vh] flex-col gap-1.5 overflow-y-auto pr-1
                ">
                  {visibleRows.map(({ segment, index }) => {
                    const visual =
                      visuals[segment.status] ?? FALLBACK_VISUAL;
                    return (
                      <HistoryRow
                        key={`${segment.startedAt}-${index}`}
                        segment={segment}
                        visual={visual}
                        duration={summary.durations[index] ?? 0}
                        isLast={index === segments.length - 1}
                        isLatest={isLatest}
                      />
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
