"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ZONE = "America/Sao_Paulo";
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function MiniCalendar({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const selected = DateTime.fromJSDate(selectedDate).setZone(ZONE);
  const selectedMonthKey = selected.toFormat("yyyy-LL");

  const [viewedMonth, setViewedMonth] = useState(() => selected.startOf("month"));
  const [syncedMonthKey, setSyncedMonthKey] = useState(selectedMonthKey);

  // Segue o mês do calendário principal quando ele muda (navegação externa),
  // mas permite o mini-calendário "passear" livremente sem mexer no principal.
  // Ajuste durante a renderização em vez de useEffect: evita um commit extra.
  if (selectedMonthKey !== syncedMonthKey) {
    setSyncedMonthKey(selectedMonthKey);
    setViewedMonth(selected.startOf("month"));
  }

  const today = DateTime.now().setZone(ZONE).startOf("day");
  const startOffset = viewedMonth.weekday % 7;
  const gridStart = viewedMonth.minus({ days: startOffset });
  const days = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));

  return (
    <div className="rounded-[12px] border border-border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewedMonth((m) => m.minus({ months: 1 }))}
          className="flex size-6 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium">
          {viewedMonth.setLocale("pt-BR").toFormat("LLLL 'de' yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setViewedMonth((m) => m.plus({ months: 1 }))}
          className="flex size-6 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted"
          aria-label="Próximo mês"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="py-1">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {days.map((day) => {
          const inMonth = day.hasSame(viewedMonth, "month");
          const isToday = day.hasSame(today, "day");
          const isSelected = day.hasSame(selected, "day");
          return (
            <button
              key={day.toISODate()}
              type="button"
              onClick={() => onSelectDate(day.toJSDate())}
              className={cn(
                "mx-auto flex size-7 items-center justify-center rounded-full transition-colors",
                !inMonth && "text-muted-foreground/40",
                inMonth && !isSelected && "text-foreground hover:bg-muted",
                isToday && !isSelected && "font-semibold text-primary",
                isSelected && "bg-primary font-semibold text-primary-foreground"
              )}
            >
              {day.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
