"use client";

import { DateTime } from "luxon";
import { Clock } from "lucide-react";

const ZONE = "America/Sao_Paulo";

// Mesmo horário de funcionamento fixo usado no AgendaView (HORARIO_FUNCIONAMENTO).
// Não importa de lá pra não acoplar os dois módulos por uma constante que só
// faz sentido nesse contexto de geração de horários cheios.
const DIAS_FUNCIONAMENTO = [1, 2, 3, 4, 5, 6]; // luxon: 1=segunda ... 7=domingo
const HORA_INICIO = 8;
const HORA_FIM = 18;

export function HorariosDisponiveis({
  selectedDate,
  onSelectSlot,
}: {
  selectedDate: Date;
  onSelectSlot: (start: Date) => void;
}) {
  const dia = DateTime.fromJSDate(selectedDate).setZone(ZONE).startOf("day");
  const aberto = DIAS_FUNCIONAMENTO.includes(dia.weekday);

  const horarios = aberto
    ? Array.from({ length: HORA_FIM - HORA_INICIO }, (_, i) =>
        dia.set({ hour: HORA_INICIO + i, minute: 0 })
      )
    : [];

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-white p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Clock size={14} className="text-muted-foreground" />
        Horários disponíveis
      </div>

      {!aberto ? (
        <p className="text-xs text-muted-foreground">Fechado neste dia.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {horarios.map((horario) => (
            <button
              key={horario.toISO()}
              type="button"
              onClick={() => onSelectSlot(horario.toJSDate())}
              className="rounded-[8px] border border-input px-1.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            >
              {horario.toFormat("HH:mm")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
