"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Gift, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCentavos } from "@/lib/currency";
import {
  desfazerPremioFidelidade,
  statusFidelidadeAgendamento,
  usarPremioFidelidade,
  type StatusFidelidade,
} from "@/app/(app)/fidelidade/actions";

/** Cartão fidelidade do cliente dentro do atendimento: mostra os carimbos e aplica o prêmio. */
export function FidelidadeBloco({ agendamentoId, onChanged }: { agendamentoId: string; onChanged: () => void }) {
  const [status, setStatus] = useState<StatusFidelidade | null>(null);
  const [isPending, startTransition] = useTransition();

  async function carregar() {
    const r = await statusFidelidadeAgendamento(agendamentoId);
    setStatus("error" in r ? null : r);
  }

  useEffect(() => {
    let cancelado = false;
    statusFidelidadeAgendamento(agendamentoId).then((r) => {
      if (!cancelado) setStatus("error" in r ? null : r);
    });
    return () => {
      cancelado = true;
    };
  }, [agendamentoId]);

  if (!status || !status.ativo) return null;

  function aplicar(usar: boolean) {
    startTransition(async () => {
      const r = usar ? await usarPremioFidelidade(agendamentoId) : await desfazerPremioFidelidade(agendamentoId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(usar ? "Prêmio aplicado neste atendimento. 🎁" : "Prêmio desfeito: o valor voltou ao normal.");
      await carregar();
      onChanged();
    });
  }

  const c = status.cartao;
  const temPremio = (c?.disponiveis ?? 0) > 0;

  if (status.resgatado) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-sun/40 px-3 py-2.5 text-sm">
        <span className="flex items-center gap-2 font-semibold text-[#5c3d00]">
          <Gift size={16} /> {status.premio} aplicado
        </span>
        <Button variant="ghost" size="sm" onClick={() => aplicar(false)} disabled={isPending}>
          Desfazer
        </Button>
      </div>
    );
  }

  return (
    <div className={temPremio ? "flex flex-col gap-2 rounded-xl bg-sun/40 px-3 py-2.5 text-sm" : "flex flex-col gap-1 rounded-xl border border-border px-3 py-2.5 text-sm"}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          {temPremio ? <Gift size={16} className="text-[#5c3d00]" /> : <PawPrint size={15} className="text-primary" />}
          {temPremio
            ? `Cliente tem ${c!.disponiveis > 1 ? `${c!.disponiveis} prêmios` : "prêmio"}: ${status.premio}`
            : `Cartão fidelidade: ${c?.progresso ?? 0} de ${status.meta}`}
        </span>
        {temPremio && !status.bloqueio && (
          <Button size="sm" onClick={() => aplicar(true)} disabled={isPending}>
            Usar prêmio
          </Button>
        )}
      </div>
      {temPremio && !status.bloqueio && (
        <span className="text-xs text-muted-foreground">
          O serviço passa de {formatCentavos(status.valorAtualCentavos)} para {formatCentavos(status.valorComPremioCentavos)}.
        </span>
      )}
      {temPremio && status.bloqueio && <span className="text-xs text-muted-foreground">{status.bloqueio}</span>}
      {!temPremio && <span className="text-xs text-muted-foreground">Faltam {c?.faltam ?? status.meta} para ganhar {status.premio}.</span>}
    </div>
  );
}
