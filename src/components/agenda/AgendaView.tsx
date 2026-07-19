"use client";

import { useCallback, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxon3Plugin from "@fullcalendar/luxon3";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type {
  EventClickArg,
  DateSelectArg,
  DatesSetArg,
} from "@fullcalendar/core";
import { createClient } from "@/lib/supabase/client";
import { NovoAgendamentoSheet } from "./NovoAgendamentoSheet";
import { AgendamentoDetailSheet } from "./AgendamentoDetailSheet";
import type { AgendamentoStatus } from "@/lib/agendamento";

// Mantém sincronizado com --status-* em src/app/globals.css.
export const STATUS_COLORS: Record<AgendamentoStatus, string> = {
  agendado: "#2563eb",
  confirmado: "#0d9488",
  concluido: "#16a34a",
  cancelado: "#6b7280",
  faltou: "#dc2626",
};

export const STATUS_LABELS: Record<AgendamentoStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

export type PetOption = { id: string; nome: string; tutorNome: string };
export type ServicoOption = { id: string; nome: string; duracao_min: number };

export type AgendamentoEvent = {
  id: string;
  status: AgendamentoStatus;
  inicio: string;
  fim: string;
  observacoes: string | null;
  petNome: string;
  tutorNome: string;
  servicoNome: string;
};

export function AgendaView({
  pets,
  servicos,
}: {
  pets: PetOption[];
  servicos: ServicoOption[];
}) {
  const [events, setEvents] = useState<AgendamentoEvent[]>([]);
  const [novoSlot, setNovoSlot] = useState<{ start: Date } | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const rangeRef = useRef<{ start: Date; end: Date } | null>(null);

  const carregarEventos = useCallback(async (start: Date, end: Date) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("agendamentos")
      .select(
        "id, inicio, fim, status, observacoes, pets(nome, tutores(nome)), servicos(nome)"
      )
      .gte("inicio", start.toISOString())
      .lt("inicio", end.toISOString())
      .order("inicio");

    setEvents(
      (data ?? []).map((row) => {
        const pet = row.pets as unknown as {
          nome: string;
          tutores: { nome: string } | null;
        } | null;
        const servico = row.servicos as unknown as { nome: string } | null;
        return {
          id: row.id,
          status: row.status as AgendamentoStatus,
          inicio: row.inicio,
          fim: row.fim,
          observacoes: row.observacoes,
          petNome: pet?.nome ?? "",
          tutorNome: pet?.tutores?.nome ?? "",
          servicoNome: servico?.nome ?? "",
        };
      })
    );
  }, []);

  function handleDatesSet(arg: DatesSetArg) {
    rangeRef.current = { start: arg.start, end: arg.end };
    void carregarEventos(arg.start, arg.end);
  }

  function handleSelect(arg: DateSelectArg) {
    setNovoSlot({ start: arg.start });
  }

  function handleEventClick(arg: EventClickArg) {
    setDetalheId(arg.event.id);
  }

  function reload() {
    if (rangeRef.current) {
      void carregarEventos(rangeRef.current.start, rangeRef.current.end);
    }
  }

  const detalhe = events.find((e) => e.id === detalheId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Agenda</h1>

      <div className="rounded-[12px] border border-border bg-white p-4 [&_.fc-toolbar-title]:text-lg [&_.fc-toolbar-title]:font-semibold">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin, luxon3Plugin]}
          timeZone="America/Sao_Paulo"
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay",
          }}
          locale={ptBrLocale}
          firstDay={1}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          allDaySlot={false}
          selectable
          selectMirror
          nowIndicator
          height="auto"
          datesSet={handleDatesSet}
          select={handleSelect}
          eventClick={handleEventClick}
          events={events.map((e) => ({
            id: e.id,
            title: `${e.petNome} · ${e.servicoNome}`,
            start: e.inicio,
            end: e.fim,
            backgroundColor: STATUS_COLORS[e.status],
            borderColor: STATUS_COLORS[e.status],
          }))}
        />
      </div>

      <NovoAgendamentoSheet
        open={!!novoSlot}
        onOpenChange={(open) => !open && setNovoSlot(null)}
        slot={novoSlot}
        pets={pets}
        servicos={servicos}
        onSaved={() => {
          setNovoSlot(null);
          reload();
        }}
      />

      <AgendamentoDetailSheet
        open={!!detalhe}
        onOpenChange={(open) => !open && setDetalheId(null)}
        agendamento={detalhe}
        onChanged={() => {
          setDetalheId(null);
          reload();
        }}
      />
    </div>
  );
}
