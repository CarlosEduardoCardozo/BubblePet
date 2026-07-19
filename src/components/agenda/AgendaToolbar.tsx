"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          aria-label="Período anterior"
        >
          <ChevronLeft size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNext} aria-label="Próximo período">
          <ChevronRight size={16} />
        </Button>
        <Button variant="outline" onClick={onToday}>
          Hoje
        </Button>
      </div>

      <h2 className="text-lg font-semibold">{title}</h2>

      <div className="flex items-center gap-1 rounded-[8px] bg-muted p-1">
        <Button
          variant={view === "timeGridWeek" ? "default" : "ghost"}
          size="sm"
          onClick={() => onChangeView("timeGridWeek")}
        >
          Semana
        </Button>
        <Button
          variant={view === "timeGridDay" ? "default" : "ghost"}
          size="sm"
          onClick={() => onChangeView("timeGridDay")}
        >
          Dia
        </Button>
      </div>
    </div>
  );
}
