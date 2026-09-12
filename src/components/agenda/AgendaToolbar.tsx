"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AgendaViewType = "timeGridWeek" | "timeGridDay";

export function AgendaToolbar({
  title,
  view,
  onPrev,
  onNext,
  onToday,
  onChangeView,
}: {
  title: string;
  view: AgendaViewType;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChangeView: (view: AgendaViewType) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={onPrev} aria-label="Período anterior">
          <ChevronLeft size={16} />
        </Button>
        <Button variant="outline" size="icon" onClick={onNext} aria-label="Próximo período">
          <ChevronRight size={16} />
        </Button>
        <Button variant="outline" onClick={onToday} className="ml-1">
          Hoje
        </Button>
      </div>

      <h2 className="text-base font-semibold sm:text-lg">
        {title.charAt(0).toUpperCase() + title.slice(1)}
      </h2>

      <div className="ml-auto flex h-8 items-center gap-0.5 rounded-[8px] bg-muted p-0.5">
        {(
          [
            ["timeGridWeek", "Semana"],
            ["timeGridDay", "Dia"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onChangeView(value)}
            aria-pressed={view === value}
            className={cn(
              "h-7 rounded-[6px] px-3 text-sm font-medium transition-colors",
              view === value
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
