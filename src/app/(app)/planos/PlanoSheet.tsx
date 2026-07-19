"use client";

import { useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCentavos } from "@/lib/currency";
import { createPlano, updatePlano } from "./actions";
import type { Plano, ServicoOption } from "./PlanosTable";

export function PlanoSheet({
  open,
  onOpenChange,
  plano,
  servicos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plano?: Plano | null;
  servicos: ServicoOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!plano;

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = plano
        ? await updatePlano(plano.id, formData)
        : await createPlano(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success(isEdit ? "Plano atualizado." : "Plano cadastrado.");
        onOpenChange(false);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar plano" : "Novo plano"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Atualize os dados do plano."
              : "Cadastre um novo plano de créditos mensais."}
          </SheetDescription>
        </SheetHeader>

        <form
          key={plano?.id ?? "new"}
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              name="nome"
              placeholder="Plano Cheiroso"
              defaultValue={plano?.nome}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="servico_id">Serviço coberto</Label>
            <select
              id="servico_id"
              name="servico_id"
              required
              defaultValue={plano?.servico_id ?? ""}
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
            <Label htmlFor="creditos_mes">Créditos por mês</Label>
            <Input
              id="creditos_mes"
              name="creditos_mes"
              type="number"
              min={1}
              step={1}
              defaultValue={plano?.creditos_mes ?? 3}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preco">Mensalidade</Label>
            <Input
              id="preco"
              name="preco"
              placeholder="149,90"
              defaultValue={
                plano
                  ? formatCentavos(plano.preco_centavos).replace("R$", "").trim()
                  : undefined
              }
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="permite_acumular"
              defaultChecked={plano?.permite_acumular ?? false}
              className="size-4 rounded border-input"
            />
            Crédito não usado acumula pro mês seguinte
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
