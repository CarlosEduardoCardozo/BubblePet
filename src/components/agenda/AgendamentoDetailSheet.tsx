"use client";

import { useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateAgendamentoStatus } from "@/app/(app)/agenda/actions";
import type { AgendamentoStatus } from "@/lib/agendamento";
import { STATUS_LABELS, type AgendamentoEvent } from "./AgendaView";

const ZONE = "America/Sao_Paulo";

const NEXT_STATUS_ACTIONS: {
  status: AgendamentoStatus;
  label: string;
  variant: "default" | "outline" | "destructive";
}[] = [
  { status: "confirmado", label: "Confirmar", variant: "outline" },
  { status: "concluido", label: "Concluir", variant: "default" },
  { status: "faltou", label: "Marcar falta", variant: "outline" },
  { status: "cancelado", label: "Cancelar", variant: "destructive" },
];

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

  function handleStatus(status: AgendamentoStatus) {
    if (!agendamento) return;
    startTransition(async () => {
      const result = await updateAgendamentoStatus(agendamento.id, status);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Status atualizado para ${STATUS_LABELS[status]}.`);
        onChanged();
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{agendamento?.petNome}</SheetTitle>
          <SheetDescription>{agendamento?.servicoNome}</SheetDescription>
        </SheetHeader>

        {agendamento && (
          <div className="flex flex-col gap-4 px-4">
            <Badge>{STATUS_LABELS[agendamento.status]}</Badge>

            <div className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Tutor</span>
              <span>{agendamento.tutorNome}</span>
            </div>

            <div className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Horário</span>
              <span>
                {DateTime.fromISO(agendamento.inicio)
                  .setZone(ZONE)
                  .setLocale("pt-BR")
                  .toFormat("dd/LL/yyyy HH:mm")}
                {" – "}
                {DateTime.fromISO(agendamento.fim)
                  .setZone(ZONE)
                  .setLocale("pt-BR")
                  .toFormat("HH:mm")}
              </span>
            </div>

            {agendamento.observacoes && (
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Observações</span>
                <span>{agendamento.observacoes}</span>
              </div>
            )}

            <SheetFooter className="mt-auto flex-row flex-wrap gap-2 px-0">
              {NEXT_STATUS_ACTIONS.filter(
                (action) => action.status !== agendamento.status
              ).map((action) => (
                <Button
                  key={action.status}
                  variant={action.variant}
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleStatus(action.status)}
                >
                  {action.label}
                </Button>
              ))}
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
