"use client";

import { useEffect, useState, useTransition } from "react";
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
import { createClient } from "@/lib/supabase/client";
import {
  createAgendamento,
  createAgendamentoComPlano,
} from "@/app/(app)/agenda/actions";
import type { PetOption, ServicoOption } from "./AgendaView";

const ZONE = "America/Sao_Paulo";
const DATETIME_FORMAT = "yyyy-LL-dd'T'HH:mm";

type PlanoInfo = { saldo: number; creditosMes: number };

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
  const [petId, setPetId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [planoInfo, setPlanoInfo] = useState<PlanoInfo | null | undefined>(undefined);
  const [usarPlano, setUsarPlano] = useState(true);

  const inicioDefault = slot
    ? DateTime.fromJSDate(slot.start).setZone(ZONE).toFormat(DATETIME_FORMAT)
    : "";

  useEffect(() => {
    if (!petId || !servicoId || !slot) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa o crédito de uma seleção anterior antes de buscar a nova
      setPlanoInfo(undefined);
      return;
    }
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("assinaturas")
        .select("id, planos!inner(creditos_mes, servico_id)")
        .eq("pet_id", petId)
        .eq("status", "ativa")
        .eq("planos.servico_id", servicoId)
        .limit(1);

      const row = data?.[0] as
        | { id: string; planos: { creditos_mes: number } }
        | undefined;
      if (!row) {
        if (!cancelled) setPlanoInfo(null);
        return;
      }

      const competencia = DateTime.fromJSDate(slot.start)
        .setZone(ZONE)
        .startOf("month")
        .toISODate();
      const { data: saldoRow } = await supabase
        .from("saldo_creditos")
        .select("saldo")
        .eq("assinatura_id", row.id)
        .eq("competencia", competencia)
        .maybeSingle();

      if (!cancelled) {
        setPlanoInfo({
          saldo: saldoRow?.saldo ?? 0,
          creditosMes: row.planos.creditos_mes,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [petId, servicoId, slot]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null);
      setPetId("");
      setServicoId("");
      setPlanoInfo(undefined);
      setUsarPlano(true);
    }
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

    const usandoCredito = usarPlano && !!planoInfo && planoInfo.saldo > 0;

    startTransition(async () => {
      const result = usandoCredito
        ? await createAgendamentoComPlano(formData)
        : await createAgendamento(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success(
          usandoCredito
            ? "Agendamento criado com crédito do plano."
            : "Agendamento criado."
        );
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
              value={petId}
              onChange={(event) => setPetId(event.target.value)}
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
              value={servicoId}
              onChange={(event) => setServicoId(event.target.value)}
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

          {planoInfo && (
            <div className="rounded-[12px] bg-primary/5 px-2.5 py-2 text-sm">
              {planoInfo.saldo > 0 ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={usarPlano}
                    onChange={(event) => setUsarPlano(event.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  Usar crédito do plano ({planoInfo.saldo} de {planoInfo.creditosMes}{" "}
                  restantes este mês)
                </label>
              ) : (
                <p className="text-muted-foreground">
                  Sem créditos disponíveis nesse mês para esse plano — será
                  cobrado como serviço avulso.
                </p>
              )}
            </div>
          )}

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
