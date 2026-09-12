"use client";

import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AGENDAMENTO_STATUSES, STATUS_COLORS, STATUS_LABELS } from "@/lib/agendamento";

export type AgendaViewType = "timeGridWeek" | "timeGridDay";

export function AgendaToolbar({
  title,
  view,
  painelAberto,
  onPrev,
  onNext,
  onToday,
  onChangeView,
  onTogglePainel,
}: {
  title: string;
  view: AgendaViewType;
  painelAberto: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChangeView: (view: AgendaViewType) => void;
  onTogglePainel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onTogglePainel}
        aria-label={painelAberto ? "Recolher painel" : "Abrir painel"}
        title={painelAberto ? "Recolher painel" : "Abrir painel"}
        className="hidden text-muted-foreground xl:inline-flex"
      >
        {painelAberto ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </Button>

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

      <div className="ml-auto hidden items-center gap-3 text-[11px] text-muted-foreground lg:flex">
        {AGENDAMENTO_STATUSES.filter((s) => s !== "cancelado").map((status) => (
          <span key={status} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
            {STATUS_LABELS[status]}
          </span>
        ))}
      </div>

      <div className="flex h-8 items-center gap-0.5 rounded-[8px] bg-muted p-0.5 lg:ml-2">
        {(
          [
            ["timeGridDay", "Dia"],
            ["timeGridWeek", "Semana"],
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
