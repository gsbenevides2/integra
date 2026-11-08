import React, { useCallback, useEffect, useState } from "react";

import { daysInMonth } from "@server/modules/birthday/model";
import { Button } from "@public/components/Button";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import {
  Bars3Icon,
  CakeIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

import { getBirthdayEdenClient } from "./client";
import { EventFormModal, type EventFormValues } from "./component/EventFormModal";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface EventRow {
  id: string;
  title: string;
  month: number;
  day: number;
}

function BirthdayDashboard() {
  const globalDrawer = useGlobalDrawer();
  const { showToast } = useToast();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  // Birthdays repeat every year: only the month matters. The current year is used
  // just to lay the weekdays out.
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const cursor = { year: new Date().getFullYear(), month };
  const [form, setForm] = useState<{ open: boolean; event?: EventFormValues }>({ open: false });

  const fetchEvents = useCallback(async () => {
    const { data, error } = await getBirthdayEdenClient().api.birthday.list.get();
    if (error) showToast("Falha ao buscar eventos", "error");
    else setEvents((data as unknown as EventRow[]) ?? []);
  }, [showToast]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const shift = (delta: number) => setMonth((m) => ((m - 1 + delta + 12) % 12) + 1);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = (day: number) =>
    today.getFullYear() === cursor.year && today.getMonth() + 1 === cursor.month && today.getDate() === day;

  // Leading/trailing days of the neighbouring months keep the grid full (dimmed, not clickable).
  const first = new Date(cursor.year, cursor.month - 1, 1);
  const gridStart = new Date(cursor.year, cursor.month - 1, 1 - first.getDay());
  const total = daysInMonth(month);
  const weeks = Math.ceil((first.getDay() + total) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return { day: d.getDate(), current: d.getMonth() === cursor.month - 1, weekend: d.getDay() % 6 === 0 };
  });

  const monthEvents = events.filter((e) => e.month === cursor.month);
  const upcoming = events
    .map((e) => {
      let date = new Date(todayStart.getFullYear(), e.month - 1, e.day);
      if (date < todayStart) date = new Date(todayStart.getFullYear() + 1, e.month - 1, e.day);
      return { ...e, inDays: Math.round((date.getTime() - todayStart.getTime()) / 86_400_000) };
    })
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, 6);
  const open = (event?: EventFormValues) => setForm({ open: true, event });

  return (
    <div className="flex animate-fade-in flex-col gap-4 p-3">
      <EventFormModal
        isOpen={form.open}
        event={form.event}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={fetchEvents}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton onClick={() => globalDrawer.setIsOpen(true)} aria-label="Abrir menu">
            <Bars3Icon className="size-5" />
          </IconButton>
          <h1 className="text-xl">Aniversários</h1>
        </div>
        <Button onClick={() => open({ title: "", month: cursor.month, day: 1 })}>
          <PlusIcon className="size-4.5" />
          <span>Criar evento</span>
        </Button>
      </div>

      <div className="
        grid grid-cols-1 gap-4
        xl:grid-cols-[1fr_20rem]
      ">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-3xl font-semibold">
              {MONTHS[cursor.month - 1]}
            </h2>
            <div className="
              relative flex items-center gap-1 rounded-lg border border-mist-700
              p-1
            ">
              <IconButton onClick={() => shift(-1)} aria-label="Mês anterior">
                <ChevronLeftIcon className="size-5" />
              </IconButton>
              <Button variant="secondary" onClick={() => setIsPickerOpen(true)}>
                <CalendarDaysIcon className="size-4.5" />
                <span>Ir para</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => setMonth(today.getMonth() + 1)}
              >
                Hoje
              </Button>
              <IconButton onClick={() => shift(1)} aria-label="Próximo mês">
                <ChevronRightIcon className="size-5" />
              </IconButton>
              {isPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsPickerOpen(false)} />
                  <div className="
                    absolute top-full right-0 z-20 mt-2 w-64 rounded-xl border
                    border-mist-700 bg-gray-950 p-3 shadow-2xl
                  ">
                    <div className="grid grid-cols-3 gap-1.5">
                      {MONTHS.map((name, i) => (
                        <button
                          key={name}
                          className={`
                            cursor-pointer rounded-lg py-2 text-sm
                            transition-colors
                            ${
                              i + 1 === cursor.month
                                ? "bg-mist-300 font-semibold text-mist-950"
                                : "hover:bg-gray-800"
                            }
                          `}
                          onClick={() => {
                            setMonth(i + 1);
                            setIsPickerOpen(false);
                          }}
                        >
                          {name.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="
            grid grid-cols-7 gap-1.5
            sm:gap-2.5
          ">
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                className={`
                  pb-1 text-center text-xs font-medium tracking-wide uppercase
                  ${i === 0 || i === 6 ? "text-mist-500" : "text-mist-300"}
                `}
              >
                {d}
              </div>
            ))}
            {cells.map((cell, i) => {
              if (!cell.current) {
                return (
                  <div
                    key={`out-${i}`}
                    className="
                      min-h-16 rounded-xl p-2 text-xs text-mist-700
                      sm:min-h-28
                      xl:min-h-32
                    "
                  >
                    {cell.day}
                  </div>
                );
              }
              const dayEvents = monthEvents.filter((e) => e.day === cell.day);
              const todayCell = isToday(cell.day);
              return (
                <div
                  key={cell.day}
                  data-testid={`day-${cell.day}`}
                  className={`
                    group flex min-h-16 cursor-pointer flex-col gap-1.5
                    rounded-xl border p-2 transition-all
                    hover:-translate-y-0.5 hover:border-mist-400
                    hover:bg-gray-900 hover:shadow-lg
                    sm:min-h-28
                    xl:min-h-32
                    ${
                      todayCell
                        ? "border-mist-300 bg-gray-900"
                        : dayEvents.length > 0
                          ? "border-mist-500 bg-gray-900"
                          : cell.weekend
                            ? "border-mist-800/70 bg-gray-900/50"
                            : "border-mist-800/70"
                    }
                  `}
                  onClick={() => open({ title: "", month: cursor.month, day: cell.day })}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`
                        flex size-7 items-center justify-center rounded-full
                        text-sm
                        ${todayCell ? "bg-mist-300 font-bold text-mist-950" : `
                          text-mist-300
                        `}
                      `}
                    >
                      {cell.day}
                    </span>
                    <PlusIcon className="
                      size-3.5 text-mist-500 opacity-0 transition-opacity
                      group-hover:opacity-100
                    " />
                  </div>
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      className="
                        flex cursor-pointer items-start gap-1.5 rounded-lg
                        border border-mist-600 bg-mist-700 px-2 py-1 text-left
                        text-xs/snug text-mist-50 transition-colors
                        hover:bg-mist-600
                      "
                      onClick={(ev) => {
                        ev.stopPropagation();
                        open(e);
                      }}
                    >
                      <CakeIcon className="
                        mt-px size-3.5 shrink-0 text-mist-300
                      " />
                      <span className="line-clamp-2 wrap-break-word first-letter:uppercase">{e.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {monthEvents.length === 0 && (
            <p className="text-center text-sm text-mist-400">
              Nenhum evento em {MONTHS[cursor.month - 1]}
            </p>
          )}
        </div>

        <aside className="
          flex h-fit flex-col gap-2 rounded-xl border border-mist-700 p-3
        ">
          <h3 className="text-sm font-medium text-mist-300">
            Próximos aniversários
          </h3>
          {upcoming.length === 0 && (
            <p className="text-sm text-mist-500">Nada cadastrado ainda</p>
          )}
          {upcoming.map((e) => (
            <button
              key={e.id}
              data-testid="upcoming"
              className="
                flex cursor-pointer items-center gap-3 rounded-lg p-2 text-left
                transition-colors
                hover:bg-gray-800
              "
              onClick={() => open(e)}
            >
              <span className="
                flex size-10 shrink-0 flex-col items-center justify-center
                rounded-lg bg-mist-900 text-xs/tight
              ">
                <b>{String(e.day).padStart(2, "0")}</b>
                <span className="text-mist-300">
                  {MONTHS[e.month - 1]!.slice(0, 3)}
                </span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate first-letter:uppercase" title={e.title}>
                  {e.title}
                </span>
                <span className="text-xs text-mist-400">
                  {e.inDays === 0 ? "Hoje 🎉" : e.inDays === 1 ? "Amanhã" : `em ${e.inDays} dias`}
                </span>
              </span>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}

export const birthdayDashboard: DashboardData = {
  id: "birthday",
  content: BirthdayDashboard,
  icon: CakeIcon,
  name: "Aniversários",
};
