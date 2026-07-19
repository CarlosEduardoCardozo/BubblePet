"use client";

import { useState, useTransition } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAgendamento } from "@/app/(app)/agenda/actions";
import type { PetOption, ServicoOption } from "./AgendaView";

const ZONE = "America/Sao_Paulo";
const DATETIME_FORMAT = "yyyy-LL-dd'T'HH:mm";

export function NovoAgendamentoSheet({
  open,
  onOpenChange,
  slot,
  pets,
  servicos,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: { start: Date } | null;
  pets: PetOption[];
  servicos: ServicoOption[];
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inicioDefault = slot
    ? DateTime.fromJSDate(slot.start).setZone(ZONE).toFormat(DATETIME_FORMAT)
    : "";

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const rawInicio = formData.get("inicio") as string;
    const zoned = DateTime.fromFormat(rawInicio, DATETIME_FORMAT, { zone: ZONE });
    if (!zoned.isValid) {
      setError("Horário inválido");
      return;
    }
    formData.set("inicio", zoned.toISO()!);

    startTransition(async () => {
      const result = await createAgendamento(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success("Agendamento criado.");
        onSaved();
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Novo agendamento</SheetTitle>
          <SheetDescription>
            A duração é calculada a partir do serviço escolhido.
          </SheetDescription>
        </SheetHeader>

        <form
          key={inicioDefault}
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pet_id">Pet</Label>
            <select
              id="pet_id"
              name="pet_id"
              required
              defaultValue=""
              className="h-8 rounded-[12px] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                Selecione um pet
              </option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.nome} — {pet.tutorNome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="servico_id">Serviço</Label>
            <select
              id="servico_id"
              name="servico_id"
              required
              defaultValue=""
              className="h-8 rounded-[12px] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                Selecione um serviço
              </option>
              {servicos.map((servico) => (
                <option key={servico.id} value={servico.id}>
                  {servico.nome} ({servico.duracao_min} min)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inicio">Início</Label>
            <input
              id="inicio"
              name="inicio"
              type="datetime-local"
              required
              defaultValue={inicioDefault}
              className="h-8 rounded-[12px] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" rows={3} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Criar agendamento"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
