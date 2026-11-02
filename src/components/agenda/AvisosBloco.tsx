"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { rotuloHoras } from "@/lib/avisos";
import { atualizarAvisos } from "@/app/(app)/agenda/actions";

/** Lembretes automáticos deste atendimento: liga e desliga cada horário na hora. */
export function AvisosBloco({
  agendamentoId,
  inicioISO,
  lembretes,
  opcoes,
  onAtualizado,
}: {
  agendamentoId: string;
  inicioISO: string;
  /** Os que valem para este atendimento; null = atendimento antigo, sem lembrete automático. */
  lembretes: number[] | null;
  /** Horários configurados no petshop. */
  opcoes: number[];
  onAtualizado: () => void;
}) {
  const [sel, setSel] = useState<number[]>(lembretes ?? []);
  const [isPending, startTransition] = useTransition();
  const horas = Array.from(new Set([...opcoes, ...sel])).sort((a, b) => b - a);
  const inicio = DateTime.fromISO(inicioISO);

  function alternar(h: number) {
    const novo = sel.includes(h) ? sel.filter((x) => x !== h) : [...sel, h].sort((a, b) => b - a);
    const anterior = sel;
    setSel(novo);
    startTransition(async () => {
      const r = await atualizarAvisos(agendamentoId, novo);
      if ("error" in r) {
        setSel(anterior);
        toast.error(r.error);
        return;
      }
      onAtualizado();
    });
  }

  if (horas.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
      <span className="flex items-center gap-2 font-medium">
        <BellRing size={15} className="text-primary" /> Lembretes automáticos
      </span>
      <div className="flex flex-wrap gap-1.5">
        {horas.map((h) => {
          const ligado = sel.includes(h);
          const passou = inicio.minus({ hours: h }) <= DateTime.now();
          return (
            <button
              key={h}
              type="button"
              aria-pressed={ligado}
              disabled={isPending || (passou && !ligado)}
              onClick={() => alternar(h)}
              title={passou ? "Esse horário já passou" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                ligado ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-muted-foreground hover:text-foreground"
              )}
            >
              {rotuloHoras(h)}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {lembretes === null && sel.length === 0
          ? "Atendimento marcado antes dos lembretes automáticos. Ligue um horário se quiser."
          : sel.length === 0
            ? "Este atendimento não recebe lembrete."
            : "Saem sozinhos nos horários ligados."}
      </span>
    </div>
  );
}
