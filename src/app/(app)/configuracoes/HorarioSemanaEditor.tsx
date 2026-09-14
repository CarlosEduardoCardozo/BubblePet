"use client";

import { Copy, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { HorarioSemana } from "@/lib/agenda/slots";

const DIAS = [
  { valor: 1, label: "Segunda", curto: "Seg" },
  { valor: 2, label: "Terça", curto: "Ter" },
  { valor: 3, label: "Quarta", curto: "Qua" },
  { valor: 4, label: "Quinta", curto: "Qui" },
  { valor: 5, label: "Sexta", curto: "Sex" },
  { valor: 6, label: "Sábado", curto: "Sáb" },
  { valor: 7, label: "Domingo", curto: "Dom" },
];

export type LinhaDia = {
  dia: number;
  aberto: boolean;
  abertura: string;
  fechamento: string;
  pausa: boolean;
  pausaInicio: string;
  pausaFim: string;
};

export function linhasDaSemana(semana: HorarioSemana): LinhaDia[] {
  return DIAS.map(({ valor }) => {
    const d = semana[valor];
    return {
      dia: valor,
      aberto: !!d,
      abertura: d?.abertura ?? "08:00",
      fechamento: d?.fechamento ?? (valor === 6 ? "12:00" : "18:00"),
      pausa: !!(d?.pausaInicio && d?.pausaFim),
      pausaInicio: d?.pausaInicio ?? "12:00",
      pausaFim: d?.pausaFim ?? "13:00",
    };
  });
}

/** O que vai pro servidor: só os dias abertos, pausa só quando ligada. */
export function semanaDasLinhas(linhas: LinhaDia[]): HorarioSemana {
  const semana: HorarioSemana = {};
  for (const l of linhas) {
    if (!l.aberto) continue;
    semana[l.dia] = {
      abertura: l.abertura,
      fechamento: l.fechamento,
      ...(l.pausa ? { pausaInicio: l.pausaInicio, pausaFim: l.pausaFim } : {}),
    };
  }
  return semana;
}

function Hora({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Input
      type="time"
      step={900}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      disabled={disabled}
      className="h-8 w-[5.75rem] bg-white px-2 text-sm"
    />
  );
}

/**
 * Horário de cada dia da semana: fechado, das X às Y, com intervalo de
 * almoço opcional. "Copiar" leva o horário de um dia pros outros dias abertos.
 */
export function HorarioSemanaEditor({
  linhas,
  onChange,
}: {
  linhas: LinhaDia[];
  onChange: (linhas: LinhaDia[]) => void;
}) {
  function alterar(dia: number, parcial: Partial<LinhaDia>) {
    onChange(linhas.map((l) => (l.dia === dia ? { ...l, ...parcial } : l)));
  }

  function copiarParaOutros(origem: LinhaDia) {
    onChange(
      linhas.map((l) =>
        l.aberto && l.dia !== origem.dia
          ? {
              ...l,
              abertura: origem.abertura,
              fechamento: origem.fechamento,
              pausa: origem.pausa,
              pausaInicio: origem.pausaInicio,
              pausaFim: origem.pausaFim,
            }
          : l
      )
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-[12px] border border-border bg-white">
      {linhas.map((l) => {
        const nome = DIAS.find((d) => d.valor === l.dia)!;
        return (
          <div key={l.dia} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <label className="flex w-28 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
              <button
                type="button"
                role="switch"
                aria-checked={l.aberto}
                aria-label={`${nome.label} ${l.aberto ? "aberto" : "fechado"}`}
                onClick={() => alterar(l.dia, { aberto: !l.aberto })}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  l.aberto ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
                    l.aberto ? "translate-x-[1.125rem]" : "translate-x-0.5"
                  )}
                />
              </button>
              <span className={cn(!l.aberto && "text-muted-foreground")}>{nome.label}</span>
            </label>

            {l.aberto ? (
              <>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Hora value={l.abertura} onChange={(v) => alterar(l.dia, { abertura: v })} label={`${nome.label}: abre às`} />
                  às
                  <Hora value={l.fechamento} onChange={(v) => alterar(l.dia, { fechamento: v })} label={`${nome.label}: fecha às`} />
                </div>

                {l.pausa ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="text-xs">almoço</span>
                    <Hora value={l.pausaInicio} onChange={(v) => alterar(l.dia, { pausaInicio: v })} label={`${nome.label}: início do intervalo`} />
                    –
                    <Hora value={l.pausaFim} onChange={(v) => alterar(l.dia, { pausaFim: v })} label={`${nome.label}: fim do intervalo`} />
                    <button
                      type="button"
                      onClick={() => alterar(l.dia, { pausa: false })}
                      className="flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
                      aria-label={`Tirar intervalo de ${nome.label}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => alterar(l.dia, { pausa: true })}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus size={12} /> Intervalo
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => copiarParaOutros(l)}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  title="Usar esse horário em todos os outros dias abertos"
                >
                  <Copy size={12} /> Copiar p/ outros dias
                </button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Fechado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
