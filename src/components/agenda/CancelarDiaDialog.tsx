"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alternar } from "@/components/shared/Alternar";
import { cancelarDia } from "@/app/(app)/agenda/actions";
import { nomeFeriado } from "@/lib/feriados-br";
import { ZONE } from "@/lib/agenda/slots";

/** Cancela todos os atendimentos marcados de um dia, com aviso opcional aos tutores. */
export function CancelarDiaDialog({
  open,
  onOpenChange,
  data,
  atendimentos,
  whatsappConectado,
  onCancelado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Date;
  /** Atendimentos do dia ainda marcados (agendados ou confirmados). */
  atendimentos: { petNome: string; tutorNome: string; hora: string }[];
  whatsappConectado: boolean;
  onCancelado: () => void;
}) {
  const dia = DateTime.fromJSDate(data).setZone(ZONE).setLocale("pt-BR");
  const iso = dia.toISODate()!;
  const feriado = nomeFeriado(iso);
  const [avisar, setAvisar] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const motivoSugerido = feriado ? `Vamos fechar por causa do feriado (${feriado}).` : "";

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const r = await cancelarDia(iso, { avisar: whatsappConectado && avisar, motivo: motivo.trim() || motivoSugerido });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      toast.success(
        `${r.cancelados} atendimento${r.cancelados === 1 ? "" : "s"} cancelado${r.cancelados === 1 ? "" : "s"}.` +
          (r.avisados ? " Os tutores estão sendo avisados pelo WhatsApp." : "")
      );
      onOpenChange(false);
      setMotivo("");
      onCancelado();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar o dia {dia.toFormat("cccc, dd/LL")}</DialogTitle>
          <DialogDescription>
            {atendimentos.length === 0
              ? "Não há atendimentos marcados nesse dia."
              : `${atendimentos.length} atendimento${atendimentos.length === 1 ? "" : "s"} será${atendimentos.length === 1 ? "" : "o"} cancelado${atendimentos.length === 1 ? "" : "s"}. O banho do plano devolve o crédito sozinho.`}
          </DialogDescription>
        </DialogHeader>

        {atendimentos.length > 0 && (
          <>
            <ul className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-xl border border-border px-3 py-2 text-sm">
              {atendimentos.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-medium">{a.petNome}</span>
                    <span className="text-muted-foreground"> · {a.tutorNome}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{a.hora}</span>
                </li>
              ))}
            </ul>

            {whatsappConectado && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="flex flex-col">
                  <span className="font-medium">Avisar os tutores pelo WhatsApp</span>
                  <span className="text-xs text-muted-foreground">Cada um recebe o aviso com o link para remarcar.</span>
                </span>
                <Alternar ligado={avisar} onChange={setAvisar} rotulo="Avisar os tutores pelo WhatsApp" />
              </label>
            )}

            {whatsappConectado && avisar && (
              <div className="flex flex-col gap-1">
                <label htmlFor="motivo-dia" className="text-xs font-medium text-muted-foreground">
                  Motivo (aparece na mensagem)
                </label>
                <Input
                  id="motivo-dia"
                  value={motivo}
                  maxLength={200}
                  placeholder={motivoSugerido || "Ex.: Vamos fechar hoje por um imprevisto."}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {erro && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={isPending || atendimentos.length === 0}>
            {isPending ? "Cancelando..." : `Cancelar ${atendimentos.length} atendimento${atendimentos.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
