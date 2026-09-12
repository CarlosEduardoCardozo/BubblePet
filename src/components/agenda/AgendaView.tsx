"use client";

import { useCallback, useState, useRef } from "react";
import { DateTime } from "luxon";
import { Plus, Gift, SlidersHorizontal } from "lucide-react";
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
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { NovoAgendamentoSheet } from "./NovoAgendamentoSheet";
import { AgendamentoDetailSheet } from "./AgendamentoDetailSheet";
import { MiniCalendar } from "./MiniCalendar";
import { HorariosDisponiveis } from "./HorariosDisponiveis";
import { AgendaFilters, EMPTY_FILTERS, type AgendaFiltersState } from "./AgendaFilters";
import { AgendaToolbar, type AgendaViewType } from "./AgendaToolbar";
import { nomeFeriado } from "@/lib/feriados-br";
import { ZONE, type HorarioFuncionamento } from "@/lib/agenda/slots";
import {
  AGENDAMENTO_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
  type AgendamentoStatus,
} from "@/lib/agendamento";

// Cores e rótulos moram em src/lib/agendamento.ts (módulo simples, usado
// também por server components); re-exportados aqui pelos imports antigos.
export { STATUS_COLORS, STATUS_LABELS };

export type PetOption = { id: string; nome: string; tutorNome: string };
export type ServicoOption = {
  id: string;
  nome: string;
  duracao_min: number;
  preco_centavos: number;
};

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
  origemPlano: boolean;
  valorCentavos: number | null;
};

function proximoSlotPadrao(referencia: Date, horario: HorarioFuncionamento): Date {
  const agora = DateTime.now().setZone(ZONE);
  const dia = DateTime.fromJSDate(referencia).setZone(ZONE).startOf("day");
  const [hAb, mAb] = horario.abertura.split(":").map(Number);
  const [hFe] = horario.fechamento.split(":").map(Number);

  if (dia.hasSame(agora, "day")) {
    const minuto = agora.minute < 30 ? 30 : 0;
    const hora = agora.minute < 30 ? agora.hour : agora.hour + 1;
    const candidato = agora.set({ hour: hora, minute: minuto, second: 0, millisecond: 0 });
    if (candidato.hour >= (hAb ?? 8) && candidato.hour < (hFe ?? 18)) return candidato.toJSDate();
  }

  return dia.set({ hour: hAb ?? 8, minute: mAb ?? 0 }).toJSDate();
}

export function AgendaView({
  pets,
  servicos,
  horario,
}: {
  pets: PetOption[];
  servicos: ServicoOption[];
  horario: HorarioFuncionamento;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<AgendamentoEvent[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoSlot, setNovoSlot] = useState<{ start: Date } | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filters, setFilters] = useState<AgendaFiltersState>(EMPTY_FILTERS);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [viewTitle, setViewTitle] = useState("");
  const [viewType, setViewType] = useState<AgendaViewType>("timeGridWeek");
  const rangeRef = useRef<{ start: Date; end: Date } | null>(null);

  const carregarEventos = useCallback(async (start: Date, end: Date) => {
    setCarregando(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("agendamentos")
      .select(
        "id, inicio, fim, status, observacoes, pet_id, servico_id, origem_plano, valor_centavos, pets(nome, tutores(nome)), servicos(nome)"
      )
      .gte("inicio", start.toISOString())
      .lt("inicio", end.toISOString())
      .order("inicio");

    setCarregando(false);
    if (error) {
      toast.error("Não foi possível carregar os agendamentos.");
      return;
    }

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
          origemPlano: row.origem_plano,
          valorCentavos: row.valor_centavos,
        };
      })
    );
  }, []);

  function handleDatesSet(arg: DatesSetArg) {
    rangeRef.current = { start: arg.start, end: arg.end };
    // Preserva uma seleção explícita (clique no mini-calendário ou no
    // cabeçalho de um dia) se ela ainda estiver visível; senão cai pro
    // padrão: hoje se estiver na semana visível, senão o início dela.
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
    calendarRef.current?.getApi().unselect();
  }

  function handleEventClick(arg: EventClickArg) {
    setDetalheId(arg.event.id);
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date);
    calendarRef.current?.getApi().gotoDate(date);
  }

  function reload() {
    if (rangeRef.current) {
      void carregarEventos(rangeRef.current.start, rangeRef.current.end);
    }
  }

  function renderEventContent(arg: EventContentArg) {
    const status = arg.event.extendedProps.status as AgendamentoStatus;
    const plano = arg.event.extendedProps.origemPlano as boolean;
    return (
      <div className="flex h-full flex-col gap-0.5 overflow-hidden px-1.5 py-1 text-xs">
        <div className="flex items-center gap-1 font-semibold text-foreground">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[status] }}
          />
          <span className="truncate">{arg.event.title}</span>
        </div>
        <span className="truncate text-muted-foreground">
          {arg.timeText}
          {plano && " · plano"}
        </span>
      </div>
    );
  }

  function renderDayHeader(arg: DayHeaderContentArg) {
    const dia = DateTime.fromJSDate(arg.date).setZone(ZONE).setLocale("pt-BR");
    const feriado = nomeFeriado(dia.toFormat("yyyy-LL-dd"));
    const isSelecionado = dia.hasSame(DateTime.fromJSDate(selectedDate).setZone(ZONE), "day");
    const isHoje = dia.hasSame(DateTime.now().setZone(ZONE), "day");
    const ehVisaoDia = arg.view.type === "timeGridDay";
    const weekdayLabel = dia.toFormat(ehVisaoDia ? "cccc" : "ccc");

    return (
      <button
        type="button"
        onClick={() => handleSelectDate(arg.date)}
        // Sem isso, o mousedown propaga pro listener global do FullCalendar,
        // que faz seu próprio hit-test por coordenada e interpreta o clique
        // no cabeçalho como um "select" na grade.
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
            isSelecionado
              ? "bg-primary text-primary-foreground"
              : isHoje
                ? "text-primary"
                : "text-foreground"
          )}
        >
          {dia.day}
        </span>
      </button>
    );
  }

  const filtrosAtivos = !!(filters.status || filters.petId || filters.servicoId);
  const filteredEvents = events.filter(
    (event) =>
      (!filters.status || event.status === filters.status) &&
      (!filters.petId || event.petId === filters.petId) &&
      (!filters.servicoId || event.servicoId === filters.servicoId)
  );

  const detalhe = events.find((e) => e.id === detalheId) ?? null;
  const ocupados = events
    .filter((e) => e.status !== "cancelado")
    .map((e) => ({ inicio: e.inicio, fim: e.fim }));
  const duracaoMinima = servicos.length
    ? Math.min(...servicos.map((s) => s.duracao_min))
    : 30;

  const businessHours = {
    daysOfWeek: horario.dias.map((d) => d % 7), // luxon 7=domingo → FullCalendar 0
    startTime: horario.abertura,
    endTime: horario.fechamento,
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Agenda"
        description="Clique num horário livre da grade ou no painel ao lado para marcar."
        action={
          <>
            <Button
              variant={filtrosAtivos ? "default" : "outline"}
              className="xl:hidden"
              onClick={() => setMostrarFiltros((v) => !v)}
            >
              <SlidersHorizontal size={16} /> Filtros
            </Button>
            <Button onClick={() => setNovoSlot({ start: proximoSlotPadrao(selectedDate, horario) })}>
              <Plus size={16} /> Novo agendamento
            </Button>
          </>
        }
      />

      {mostrarFiltros && (
        <div className="xl:hidden">
          <AgendaFilters filters={filters} onChange={setFilters} pets={pets} servicos={servicos} />
        </div>
      )}

      <div className="flex gap-4">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 xl:flex">
          <MiniCalendar selectedDate={selectedDate} onSelectDate={handleSelectDate} />
          <HorariosDisponiveis
            selectedDate={selectedDate}
            horario={horario}
            ocupados={ocupados}
            duracaoMin={duracaoMinima}
            onSelectSlot={(start) => setNovoSlot({ start })}
          />
          <AgendaFilters filters={filters} onChange={setFilters} pets={pets} servicos={servicos} />
        </aside>

        <div
          className={cn(
            "min-w-0 flex-1 rounded-[12px] border border-border bg-white p-3 transition-opacity sm:p-4",
            carregando && "opacity-60"
          )}
          aria-busy={carregando}
        >
          <AgendaToolbar
            title={viewTitle}
            view={viewType}
            onPrev={() => calendarRef.current?.getApi().prev()}
            onNext={() => calendarRef.current?.getApi().next()}
            onToday={() => calendarRef.current?.getApi().today()}
            onChangeView={(view) => calendarRef.current?.getApi().changeView(view)}
          />
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin, luxon3Plugin]}
            timeZone={ZONE}
            initialView="timeGridWeek"
            headerToolbar={false}
            businessHours={businessHours}
            locale={ptBrLocale}
            firstDay={1}
            slotMinTime="06:30:00"
            slotMaxTime="21:00:00"
            slotDuration="00:10:00"
            slotLabelInterval="00:30:00"
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
              extendedProps: { status: e.status, origemPlano: e.origemPlano },
            }))}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {AGENDAMENTO_STATUSES.map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                {STATUS_LABELS[status]}
              </span>
            ))}
            {filtrosAtivos && (
              <span className="ml-auto text-primary">Filtros aplicados à semana visível</span>
            )}
          </div>
        </div>
      </div>

      <NovoAgendamentoSheet
        open={!!novoSlot}
        onOpenChange={(open) => !open && setNovoSlot(null)}
        slot={novoSlot}
        pets={pets}
        servicos={servicos}
        horario={horario}
        ocupados={ocupados}
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
