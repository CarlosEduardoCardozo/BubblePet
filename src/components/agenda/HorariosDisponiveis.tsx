"use client";

import { DateTime } from "luxon";
import { Clock } from "lucide-react";
import {
  calcularHorariosLivres,
  diaAberto,
  ZONE,
  type HorarioFuncionamento,
  type Ocupado,
} from "@/lib/agenda/slots";

export function HorariosDisponiveis({
  selectedDate,
  horario,
  ocupados,
  duracaoMin,
  onSelectSlot,
}: {
  selectedDate: Date;
  horario: HorarioFuncionamento;
  /** Agendamentos já carregados na agenda (qualquer dia — filtramos aqui). */
  ocupados: Ocupado[];
  /** Duração do serviço mais curto: o horário aparece se cabe pelo menos ele. */
  duracaoMin: number;
  onSelectSlot: (start: Date) => void;
}) {
  const dia = DateTime.fromJSDate(selectedDate).setZone(ZONE).startOf("day");
  const dataISO = dia.toISODate()!;
  const aberto = diaAberto(dataISO, horario);
  const passado = dia < DateTime.now().setZone(ZONE).startOf("day");

  const livres = aberto && !passado
    ? calcularHorariosLivres({
        dataISO,
        duracaoMin,
        ocupados,
        horario,
        stepMin: 30,
        antecedenciaMin: 0,
      })
    : [];

  const titulo = dia.setLocale("pt-BR").toFormat("ccc, dd/LL");

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Clock size={14} className="text-muted-foreground" />
          Horários livres
        </span>
        <span className="text-xs capitalize text-muted-foreground">{titulo}</span>
      </div>

      {!aberto ? (
        <p className="text-xs text-muted-foreground">Fechado neste dia.</p>
      ) : passado ? (
        <p className="text-xs text-muted-foreground">Dia já passou.</p>
      ) : livres.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum horário livre — agenda cheia.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {livres.map((horarioLivre) => (
            <button
              key={horarioLivre.toISO()}
              type="button"
              onClick={() => onSelectSlot(horarioLivre.toJSDate())}
              className="rounded-[8px] border border-input px-1.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            >
              {horarioLivre.toFormat("HH:mm")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
