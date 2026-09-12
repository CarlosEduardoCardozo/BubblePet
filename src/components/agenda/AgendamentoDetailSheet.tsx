"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Check, CheckCheck, UserX, XCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatCentavos } from "@/lib/currency";
import { updateAgendamentoStatus } from "@/app/(app)/agenda/actions";
import { STATUS_LABELS, type AgendamentoStatus } from "@/lib/agendamento";
import { LembreteButton } from "./LembreteButton";
import type { AgendamentoEvent } from "./AgendaView";

const ZONE = "America/Sao_Paulo";

export function AgendamentoDetailSheet({
  open,
  onOpenChange,
  agendamento,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamento: AgendamentoEvent | null;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState<"cancelado" | "faltou" | null>(null);
  // Mantém o último agendamento durante a animação de fechar, senão o título
  // pisca vazio.
  const [ultimo, setUltimo] = useState<AgendamentoEvent | null>(null);
  if (agendamento && agendamento !== ultimo) setUltimo(agendamento);
  const dados = agendamento ?? ultimo;

  function aplicarStatus(status: AgendamentoStatus) {
    if (!dados) return;
    const id = dados.id;
    startTransition(async () => {
      const result = await updateAgendamentoStatus(id, status);
      setConfirmando(null);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Marcado como ${STATUS_LABELS[status].toLowerCase()}.`);
        onChanged();
      }
    });
  }

  const inicio = dados ? DateTime.fromISO(dados.inicio).setZone(ZONE).setLocale("pt-BR") : null;
  const fim = dados ? DateTime.fromISO(dados.fim).setZone(ZONE) : null;
  const encerrado = dados?.status === "concluido" || dados?.status === "cancelado" || dados?.status === "faltou";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{dados?.petNome ?? "Agendamento"}</SheetTitle>
            <SheetDescription>{dados?.servicoNome}</SheetDescription>
          </SheetHeader>

          {dados && inicio && fim && (
            <div className="flex flex-1 flex-col gap-4 px-4">
              <div className="flex items-center justify-between">
                <StatusBadge status={dados.status} />
                {!encerrado && <LembreteButton agendamentoId={dados.id} size="sm" variant="outline" />}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Quando</span>
                  <span className="font-medium capitalize">{inicio.toFormat("ccc, dd/LL")}</span>
                  <span>
                    {inicio.toFormat("HH:mm")} – {fim.toFormat("HH:mm")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Tutor</span>
                  <span className="font-medium">{dados.tutorNome}</span>
                </div>
              </div>

              <div
                className={
                  dados.origemPlano
                    ? "rounded-[12px] bg-primary/5 px-3 py-2 text-sm"
                    : "rounded-[12px] bg-muted px-3 py-2 text-sm"
                }
              >
                {dados.origemPlano ? (
                  <>
                    <span className="font-medium text-primary">Coberto pelo plano</span>
                    <span className="text-muted-foreground"> — 1 crédito do mês. Sem cobrança.</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Avulso</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {dados.valorCentavos != null
                        ? `${formatCentavos(dados.valorCentavos)}, entra no fechamento do mês.`
                        : "valor do serviço na data."}
                    </span>
                  </>
                )}
              </div>

              {dados.observacoes && (
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="text-xs text-muted-foreground">Observações</span>
                  <span className="whitespace-pre-wrap">{dados.observacoes}</span>
                </div>
              )}

              <SheetFooter className="mt-auto flex-col gap-2 px-0">
                {dados.status === "agendado" && (
                  <Button variant="outline" disabled={isPending} onClick={() => aplicarStatus("confirmado")}>
                    <Check size={16} /> Confirmar presença
                  </Button>
                )}
                {(dados.status === "agendado" || dados.status === "confirmado") && (
                  <Button disabled={isPending} onClick={() => aplicarStatus("concluido")}>
                    <CheckCheck size={16} /> Concluir atendimento
                  </Button>
                )}
                {!encerrado && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-muted-foreground"
                      disabled={isPending}
                      onClick={() => setConfirmando("faltou")}
                    >
                      <UserX size={14} /> Não veio
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => setConfirmando("cancelado")}
                    >
                      <XCircle size={14} /> Cancelar
                    </Button>
                  </div>
                )}
                {encerrado && dados.status !== "concluido" && (
                  <Button variant="outline" disabled={isPending} onClick={() => aplicarStatus("agendado")}>
                    Reabrir agendamento
                  </Button>
                )}
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmando === "cancelado"}
        onOpenChange={(o) => !o && setConfirmando(null)}
        title="Cancelar este agendamento?"
        description={
          dados?.origemPlano
            ? "O crédito do plano volta para o pet automaticamente. O horário fica livre na agenda."
            : "O horário fica livre na agenda. Dá pra reabrir depois, se precisar."
        }
        confirmLabel="Cancelar agendamento"
        pendingLabel="Cancelando..."
        onConfirm={() => aplicarStatus("cancelado")}
        pending={isPending}
      />
      <ConfirmDialog
        open={confirmando === "faltou"}
        onOpenChange={(o) => !o && setConfirmando(null)}
        title="Marcar como falta?"
        description={
          dados?.origemPlano
            ? "O crédito do plano é consumido mesmo assim — o tutor não compareceu."
            : "O atendimento não entra no fechamento do mês."
        }
        confirmLabel="Marcar falta"
        pendingLabel="Salvando..."
        confirmVariant="default"
        onConfirm={() => aplicarStatus("faltou")}
        pending={isPending}
      />
    </>
  );
}
