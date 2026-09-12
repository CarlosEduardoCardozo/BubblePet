"use client";

import { useCallback, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Plus, Gift } from "lucide-react";
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
  DayHeaderContentArg,
} from "@fullcalendar/core";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { NovoAgendamentoSheet } from "./NovoAgendamentoSheet";
import { AgendamentoDetailSheet } from "./AgendamentoDetailSheet";
import { MiniCalendar } from "./MiniCalendar";
import { HorariosDisponiveis } from "./HorariosDisponiveis";
import { AgendaFilters, EMPTY_FILTERS, type AgendaFiltersState } from "./AgendaFilters";
import { AgendaToolbar, type AgendaViewType } from "./AgendaToolbar";
import { nomeFeriado } from "@/lib/feriados-br";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  type AgendamentoStatus,
} from "@/lib/agendamento";

// Padrão fixo por enquanto — não existe "horário de funcionamento" por
// petshop em nenhuma fase do doc. Quando existir, troca por config do banco;
// o mecanismo visual (classe .fc-non-business em globals.css) já fica pronto.
const HORARIO_FUNCIONAMENTO = {
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  startTime: "08:00",
  endTime: "18:00",
};

const ZONE = "America/Sao_Paulo";

// Cores e rótulos moram em src/lib/agendamento.ts (módulo simples, usado
// também por server components); re-exportados aqui pelos imports antigos.
export { STATUS_COLORS, STATUS_LABELS };

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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filters, setFilters] = useState<AgendaFiltersState>(EMPTY_FILTERS);
  const [viewTitle, setViewTitle] = useState("");
  const [viewType, setViewType] = useState<AgendaViewType>("timeGridWeek");
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
    // Preserva uma seleção explícita (clique no mini-calendário ou no
    // cabeçalho de um dia) se ela ainda estiver visível; senão cai pro
    // padrão de sempre: hoje se estiver na semana visível, senão o início
    // dela. getDate() da FullCalendar não serve pra isso — retorna o início
    // da semana visível, não necessariamente "hoje" (firstDay é segunda).
    setSelectedDate((atual) => {
      if (atual >= arg.start && atual < arg.end) return atual;
      const hoje = new Date();
      return hoje >= arg.start && hoje < arg.end ? hoje : arg.start;
    });
    setViewTitle(arg.view.title);
    setViewType(arg.view.type as AgendaViewType);
    void carregarEventos(arg.start, arg.end);
  }

  function handleSelect(arg: DateSelectArg) {
    setNovoSlot({ start: arg.start });
  }

  function handleEventClick(arg: EventClickArg) {
    setDetalheId(arg.event.id);
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date);
    calendarRef.current?.getApi().gotoDate(date);
  }

  function handlePrev() {
    calendarRef.current?.getApi().prev();
  }

  function handleNext() {
    calendarRef.current?.getApi().next();
  }

  function handleToday() {
    calendarRef.current?.getApi().today();
  }

  function handleChangeView(view: AgendaViewType) {
    calendarRef.current?.getApi().changeView(view);
  }

  function handleFloatingAdd() {
    setNovoSlot({ start: proximoSlotPadrao(selectedDate) });
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

  function renderDayHeader(arg: DayHeaderContentArg) {
    const dia = DateTime.fromJSDate(arg.date).setZone(ZONE).setLocale("pt-BR");
    const feriado = nomeFeriado(dia.toFormat("yyyy-LL-dd"));
    const isSelecionado = dia.hasSame(DateTime.fromJSDate(selectedDate).setZone(ZONE), "day");
    const ehVisaoDia = arg.view.type === "timeGridDay";
    const weekdayLabel = dia.toFormat(ehVisaoDia ? "cccc" : "ccc");

    return (
      <button
        type="button"
        onClick={() => handleSelectDate(arg.date)}
        // Sem isso, o mousedown propaga pro listener global do FullCalendar,
        // que faz seu próprio hit-test por coordenada e interpreta o clique
        // no cabeçalho como um "select" na grade (abre o sheet de novo
        // agendamento num horário aleatório, além do nosso onClick rodar).
        onMouseDown={(event) => event.stopPropagation()}
        className="flex w-full flex-col items-center gap-1 py-1.5"
        title={feriado ?? undefined}
      >
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {ehVisaoDia ? weekdayLabel : weekdayLabel.toUpperCase()}
          {feriado && <Gift size={11} className="text-primary" />}
        </span>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-base font-semibold",
            isSelecionado ? "bg-primary text-primary-foreground" : "text-foreground"
          )}
        >
          {dia.day}
        </span>
      </button>
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
          <MiniCalendar selectedDate={selectedDate} onSelectDate={handleSelectDate} />
          <AgendaFilters
            filters={filters}
            onChange={setFilters}
            pets={pets}
            servicos={servicos}
          />
          <HorariosDisponiveis
            selectedDate={selectedDate}
            onSelectSlot={(start) => setNovoSlot({ start })}
          />
        </aside>

        <div className="min-w-0 flex-1 rounded-[12px] border border-border bg-white p-4">
          <AgendaToolbar
            title={viewTitle}
            view={viewType}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={handleToday}
            onChangeView={handleChangeView}
          />
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin, luxon3Plugin]}
            timeZone={ZONE}
            initialView="timeGridWeek"
            headerToolbar={false}
            businessHours={HORARIO_FUNCIONAMENTO}
            locale={ptBrLocale}
            firstDay={1}
            slotMinTime="06:30:00"
            slotMaxTime="21:00:00"
            slotDuration="00:10:00"
            slotLabelInterval="00:10:00"
            allDaySlot={false}
            selectable
            selectMirror
            nowIndicator
            height="auto"
            datesSet={handleDatesSet}
            select={handleSelect}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            dayHeaderContent={renderDayHeader}
            events={filteredEvents.map((e) => ({
              id: e.id,
              title: `${e.petNome} · ${e.servicoNome}`,
              start: e.inicio,
              end: e.fim,
              backgroundColor: `${STATUS_COLORS[e.status]}29`,
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
