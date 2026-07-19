"use client";

import { useCallback, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Plus } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxon3Plugin from "@fullcalendar/luxon3";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type {
  EventClickArg,
  DateSelectArg,
  DatesSetArg,
  EventContentArg,
} from "@fullcalendar/core";
import { createClient } from "@/lib/supabase/client";
import { NovoAgendamentoSheet } from "./NovoAgendamentoSheet";
import { AgendamentoDetailSheet } from "./AgendamentoDetailSheet";
import { MiniCalendar } from "./MiniCalendar";
import { AgendaFilters, EMPTY_FILTERS, type AgendaFiltersState } from "./AgendaFilters";
import type { AgendamentoStatus } from "@/lib/agendamento";

const ZONE = "America/Sao_Paulo";

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
  petId: string;
  petNome: string;
  tutorNome: string;
  servicoId: string;
  servicoNome: string;
};

function proximoSlotPadrao(referencia: Date): Date {
  const agora = DateTime.now().setZone(ZONE);
  const dia = DateTime.fromJSDate(referencia).setZone(ZONE).startOf("day");
  const isHoje = dia.hasSame(agora, "day");

  if (isHoje) {
    const minuto = agora.minute < 30 ? 30 : 0;
    const hora = agora.minute < 30 ? agora.hour : agora.hour + 1;
    const candidato = agora.set({ hour: hora, minute: minuto, second: 0, millisecond: 0 });
    if (candidato.hour >= 7 && candidato.hour < 21) return candidato.toJSDate();
  }

  return dia.set({ hour: 9, minute: 0 }).toJSDate();
}

export function AgendaView({
  pets,
  servicos,
}: {
  pets: PetOption[];
  servicos: ServicoOption[];
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<AgendamentoEvent[]>([]);
  const [novoSlot, setNovoSlot] = useState<{ start: Date } | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filters, setFilters] = useState<AgendaFiltersState>(EMPTY_FILTERS);
  const rangeRef = useRef<{ start: Date; end: Date } | null>(null);

  const carregarEventos = useCallback(async (start: Date, end: Date) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("agendamentos")
      .select(
        "id, inicio, fim, status, observacoes, pet_id, servico_id, pets(nome, tutores(nome)), servicos(nome)"
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
          petId: row.pet_id,
          petNome: pet?.nome ?? "",
          tutorNome: pet?.tutores?.nome ?? "",
          servicoId: row.servico_id,
          servicoNome: servico?.nome ?? "",
        };
      })
    );
  }, []);

  function handleDatesSet(arg: DatesSetArg) {
    rangeRef.current = { start: arg.start, end: arg.end };
    // getDate() da FullCalendar retorna o início da semana visível, não
    // necessariamente "hoje" (nosso firstDay é segunda, não domingo). Destaca
    // hoje quando ele está na semana visível; senão destaca o início dela.
    const hoje = new Date();
    const hojeNaVista = hoje >= arg.start && hoje < arg.end;
    setCurrentDate(hojeNaVista ? hoje : arg.start);
    void carregarEventos(arg.start, arg.end);
  }

  function handleSelect(arg: DateSelectArg) {
    setNovoSlot({ start: arg.start });
  }

  function handleEventClick(arg: EventClickArg) {
    setDetalheId(arg.event.id);
  }

  function handleSelectDate(date: Date) {
    calendarRef.current?.getApi().gotoDate(date);
  }

  function handleFloatingAdd() {
    setNovoSlot({ start: proximoSlotPadrao(currentDate) });
  }

  function reload() {
    if (rangeRef.current) {
      void carregarEventos(rangeRef.current.start, rangeRef.current.end);
    }
  }

  function renderEventContent(arg: EventContentArg) {
    const status = arg.event.extendedProps.status as AgendamentoStatus;
    return (
      <div className="flex h-full flex-col gap-0.5 overflow-hidden px-1.5 py-1 text-xs">
        <div className="flex items-center gap-1 font-semibold text-foreground">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[status] }}
          />
          <span className="truncate">{arg.event.title}</span>
        </div>
        {arg.timeText && <span className="text-muted-foreground">{arg.timeText}</span>}
      </div>
    );
  }

  const filteredEvents = events.filter(
    (event) =>
      (!filters.status || event.status === filters.status) &&
      (!filters.petId || event.petId === filters.petId) &&
      (!filters.servicoId || event.servicoId === filters.servicoId)
  );

  const detalhe = events.find((e) => e.id === detalheId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Agenda</h1>

      <div className="flex gap-4">
        <aside className="flex w-64 shrink-0 flex-col gap-4">
          <MiniCalendar selectedDate={currentDate} onSelectDate={handleSelectDate} />
          <AgendaFilters
            filters={filters}
            onChange={setFilters}
            pets={pets}
            servicos={servicos}
          />
        </aside>

        <div className="min-w-0 flex-1 rounded-[12px] border border-border bg-white p-4 [&_.fc-toolbar-title]:text-lg [&_.fc-toolbar-title]:font-semibold">
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin, luxon3Plugin]}
            timeZone={ZONE}
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
            eventContent={renderEventContent}
            events={filteredEvents.map((e) => ({
              id: e.id,
              title: `${e.petNome} · ${e.servicoNome}`,
              start: e.inicio,
              end: e.fim,
              backgroundColor: `${STATUS_COLORS[e.status]}1a`,
              borderColor: STATUS_COLORS[e.status],
              extendedProps: { status: e.status },
            }))}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleFloatingAdd}
        aria-label="Novo agendamento"
        className="fixed right-6 bottom-6 z-10 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
      >
        <Plus size={24} />
      </button>

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
