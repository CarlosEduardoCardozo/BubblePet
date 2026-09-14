"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { DateTime } from "luxon";
import { Plus, Gift, SlidersHorizontal, PawPrint } from "lucide-react";
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
  EventDropArg,
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
import { moverAgendamento } from "@/app/(app)/agenda/actions";
import { STATUS_COLORS, STATUS_LABELS, type AgendamentoStatus } from "@/lib/agendamento";
import { lerAdicionais, type Adicional } from "@/lib/adicionais";

// Cores e rótulos moram em src/lib/agendamento.ts (módulo simples, usado
// também por server components); re-exportados aqui pelos imports antigos.
export { STATUS_COLORS, STATUS_LABELS };

export type PetOption = {
  id: string;
  nome: string;
  tutorId: string;
  tutorNome: string;
  porte: string | null;
};
export type TutorOption = { id: string; nome: string; telefone: string | null };
export type ServicoOption = {
  id: string;
  nome: string;
  duracao_min: number;
  preco_centavos: number;
  preco_pequeno_centavos: number | null;
  preco_medio_centavos: number | null;
  preco_grande_centavos: number | null;
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
  adicionais: Adicional[];
  /** Já entrou num extrato enviado ou pago: valores congelados. */
  cobrado: boolean;
};

function hm(valor: string): { hour: number; minute: number } {
  const [h, m] = valor.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

function proximoSlotPadrao(referencia: Date, horario: HorarioFuncionamento): Date {
  const agora = DateTime.now().setZone(ZONE);
  const dia = DateTime.fromJSDate(referencia).setZone(ZONE).startOf("day");
  const abertura = hm(horario.abertura);
  const fechamento = hm(horario.fechamento);

  if (dia.hasSame(agora, "day")) {
    const minuto = agora.minute < 30 ? 30 : 0;
    const hora = agora.minute < 30 ? agora.hour : agora.hour + 1;
    const candidato = agora.set({ hour: hora, minute: minuto, second: 0, millisecond: 0 });
    if (candidato.hour >= abertura.hour && candidato.hour < fechamento.hour) return candidato.toJSDate();
  }

  return dia.set(abertura).toJSDate();
}

/** "08:00" -> "07:00:00": a grade mostra 1h antes de abrir e 1h depois de fechar. */
function comFolga(valor: string, horas: number): string {
  const { hour, minute } = hm(valor);
  const h = Math.min(24, Math.max(0, hour + horas));
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function AgendaView({
  pets,
  tutores,
  servicos,
  horario,
  whatsappConectado,
}: {
  pets: PetOption[];
  tutores: TutorOption[];
  servicos: ServicoOption[];
  horario: HorarioFuncionamento;
  whatsappConectado: boolean;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<AgendamentoEvent[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoSlot, setNovoSlot] = useState<{ start: Date } | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filters, setFilters] = useState<AgendaFiltersState>(EMPTY_FILTERS);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [painelAberto, setPainelAberto] = useState(true);
  const [viewTitle, setViewTitle] = useState("");
  const [viewType, setViewType] = useState<AgendaViewType>("timeGridWeek");
  const rangeRef = useRef<{ start: Date; end: Date } | null>(null);

  // No celular a semana inteira não cabe: abre no dia.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      calendarRef.current?.getApi().changeView("timeGridDay");
    }
  }, []);

  const carregarEventos = useCallback(async (start: Date, end: Date) => {
    setCarregando(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("agendamentos")
      .select(
        "id, inicio, fim, status, observacoes, pet_id, servico_id, origem_plano, valor_centavos, adicionais, pets(nome, tutores(nome)), servicos(nome), fechamentos(status, enviado_em)"
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
        const fechamento = row.fechamentos as unknown as { status: string; enviado_em: string | null } | null;
        const extras = lerAdicionais(row.adicionais);
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
          adicionais: extras.ok ? extras.adicionais : [],
          cobrado: !!fechamento && (fechamento.status === "pago" || !!fechamento.enviado_em),
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

  function handleEventDrop(arg: EventDropArg) {
    const inicio = arg.event.start;
    if (!inicio) {
      arg.revert();
      return;
    }
    // Otimista: o FullCalendar já moveu o cartão; se o servidor recusar,
    // volta pro lugar e explica.
    void (async () => {
      const result = await moverAgendamento(arg.event.id, inicio.toISOString());
      if ("error" in result) {
        arg.revert();
        toast.error(result.error);
      } else {
        toast.success(
          `Reagendado para ${DateTime.fromJSDate(inicio).setZone(ZONE).setLocale("pt-BR").toFormat("ccc dd/LL 'às' HH:mm")}.`
        );
        reload();
      }
    })();
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
    const plano = arg.event.extendedProps.origemPlano as boolean;
    const servico = arg.event.extendedProps.servicoNome as string;
    const extras = arg.event.extendedProps.extras as number;
    const curto = arg.event.end && arg.event.start
      ? arg.event.end.getTime() - arg.event.start.getTime() <= 30 * 60_000
      : false;
    return (
      <div className="flex h-full min-w-0 items-start gap-1 overflow-hidden px-1.5 py-0.5 leading-tight">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">
            {arg.event.title}
            {curto && (
              <span className="ml-1 font-normal text-muted-foreground">{arg.timeText}</span>
            )}
          </div>
          {!curto && (
            <div className="truncate text-[11px] text-muted-foreground">
              {servico}
              {extras > 0 && ` +${extras}`} · {arg.timeText}
            </div>
          )}
        </div>
        {plano && (
          <PawPrint size={11} className="mt-0.5 shrink-0 text-primary" aria-label="Coberto pelo plano" />
        )}
      </div>
    );
  }

  function renderDayHeader(arg: DayHeaderContentArg) {
    const dia = DateTime.fromJSDate(arg.date).setZone(ZONE).setLocale("pt-BR");
    const feriado = nomeFeriado(dia.toFormat("yyyy-LL-dd"));
    const isSelecionado = dia.hasSame(DateTime.fromJSDate(selectedDate).setZone(ZONE), "day");
    const isHoje = dia.hasSame(DateTime.now().setZone(ZONE), "day");
    const ehVisaoDia = arg.view.type === "timeGridDay";
    const weekdayLabel = dia.toFormat(ehVisaoDia ? "cccc" : "ccc").replace(".", "");

    return (
      <button
        type="button"
        onClick={() => handleSelectDate(arg.date)}
        // Sem isso, o mousedown propaga pro listener global do FullCalendar,
        // que faz seu próprio hit-test por coordenada e interpreta o clique
        // no cabeçalho como um "select" na grade.
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 py-1.5",
          ehVisaoDia && "gap-2"
        )}
        title={feriado ?? undefined}
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-sm font-semibold",
            isSelecionado
              ? "bg-primary text-primary-foreground"
              : isHoje
                ? "text-primary"
                : "text-foreground"
          )}
        >
          {dia.day}
        </span>
        <span className={cn("text-xs font-medium uppercase", isHoje ? "text-primary" : "text-muted-foreground")}>
          {weekdayLabel}
        </span>
        {feriado && <Gift size={11} className="text-primary" />}
      </button>
    );
  }

  const filtrosAtivos = !!(filters.status || filters.petId || filters.servicoId);
  const filteredEvents = events.filter(
    (event) =>
      // Cancelados só aparecem quando o filtro pede: ocupam espaço à toa.
      (filters.status ? event.status === filters.status : event.status !== "cancelado") &&
      (!filters.petId || event.petId === filters.petId) &&
      (!filters.servicoId || event.servicoId === filters.servicoId)
  );

  const detalhe = events.find((e) => e.id === detalheId) ?? null;
  const ocupados = events
    .filter((e) => e.status !== "cancelado" && e.status !== "faltou")
    .map((e) => ({ id: e.id, inicio: e.inicio, fim: e.fim }));
  const duracaoMinima = servicos.length
    ? Math.min(...servicos.map((s) => s.duracao_min))
    : 30;

  const businessHours = {
    daysOfWeek: horario.dias.map((d) => d % 7), // luxon 7=domingo → FullCalendar 0
    startTime: horario.abertura,
    endTime: horario.fechamento,
  };

  const agora = DateTime.now().setZone(ZONE);
  const scrollTime = agora.hour >= hm(horario.abertura).hour
    ? agora.minus({ hours: 1 }).toFormat("HH:00:00")
    : comFolga(horario.abertura, 0);

  return (
    <div className="flex h-[calc(100dvh-3.5rem-2rem)] min-h-[520px] flex-col gap-3 md:h-[calc(100dvh-3.5rem-3rem)]">
      <PageHeader
        title="Agenda"
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

      <div className="flex min-h-0 flex-1 gap-3">
        {painelAberto && (
          <aside className="hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto xl:flex">
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
        )}

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-border bg-white transition-opacity",
            carregando && "opacity-70"
          )}
          aria-busy={carregando}
        >
          <AgendaToolbar
            title={viewTitle}
            view={viewType}
            painelAberto={painelAberto}
            onPrev={() => calendarRef.current?.getApi().prev()}
            onNext={() => calendarRef.current?.getApi().next()}
            onToday={() => calendarRef.current?.getApi().today()}
            onChangeView={(view) => calendarRef.current?.getApi().changeView(view)}
            onTogglePainel={() => setPainelAberto((v) => !v)}
          />
          <div className="min-h-0 flex-1 p-2 sm:p-3 [&_.fc]:h-full">
            <FullCalendar
              ref={calendarRef}
              plugins={[timeGridPlugin, interactionPlugin, luxon3Plugin]}
              timeZone={ZONE}
              initialView="timeGridWeek"
              headerToolbar={false}
              businessHours={businessHours}
              locale={ptBrLocale}
              firstDay={1}
              slotMinTime={comFolga(horario.abertura, -1)}
              slotMaxTime={comFolga(horario.fechamento, 1)}
              slotDuration="00:15:00"
              slotLabelInterval="01:00:00"
              slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              snapDuration="00:15:00"
              scrollTime={scrollTime}
              scrollTimeReset={false}
              allDaySlot={false}
              selectable
              selectMirror
              editable
              eventDurationEditable={false}
              eventOverlap={(horario.capacidade ?? 1) > 1}
              slotEventOverlap={false}
              nowIndicator
              height="100%"
              expandRows={false}
              datesSet={handleDatesSet}
              select={handleSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventContent={renderEventContent}
              dayHeaderContent={renderDayHeader}
              events={filteredEvents.map((e) => ({
                id: e.id,
                title: e.petNome,
                start: e.inicio,
                end: e.fim,
                classNames: [`bp-status-${e.status}`],
                editable: e.status === "agendado" || e.status === "confirmado",
                extendedProps: {
                  status: e.status,
                  origemPlano: e.origemPlano,
                  servicoNome: e.servicoNome,
                  extras: e.adicionais.length,
                },
              }))}
            />
          </div>
          {filtrosAtivos && (
            <div className="border-t border-border px-4 py-1.5 text-xs text-primary">
              Filtros aplicados à semana visível ·{" "}
              <button type="button" className="underline" onClick={() => setFilters(EMPTY_FILTERS)}>
                limpar
              </button>
            </div>
          )}
        </div>
      </div>

      <NovoAgendamentoSheet
        open={!!novoSlot}
        onOpenChange={(open) => !open && setNovoSlot(null)}
        slot={novoSlot}
        pets={pets}
        tutores={tutores}
        servicos={servicos}
        horario={horario}
        ocupados={ocupados}
        whatsappConectado={whatsappConectado}
        onSaved={() => {
          setNovoSlot(null);
          reload();
        }}
      />

      <AgendamentoDetailSheet
        open={!!detalhe}
        onOpenChange={(open) => !open && setDetalheId(null)}
        agendamento={detalhe}
        servicos={servicos}
        pets={pets}
        horario={horario}
        ocupados={ocupados}
        onChanged={() => {
          setDetalheId(null);
          reload();
        }}
      />
    </div>
  );
}
