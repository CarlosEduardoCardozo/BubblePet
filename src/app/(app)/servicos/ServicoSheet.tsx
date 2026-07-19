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
import { createServico, updateServico } from "./actions";
import type { Servico } from "./ServicosTable";

export function ServicoSheet({
  open,
  onOpenChange,
  servico,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servico?: Servico | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!servico;

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = servico
        ? await updateServico(servico.id, formData)
        : await createServico(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success(isEdit ? "Serviço atualizado." : "Serviço cadastrado.");
        onOpenChange(false);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar serviço" : "Novo serviço"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Atualize os dados do serviço."
              : "Cadastre um novo serviço do petshop."}
          </SheetDescription>
        </SheetHeader>

        <form
          key={servico?.id ?? "new"}
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              name="nome"
              placeholder="Banho e tosa"
              defaultValue={servico?.nome}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duracao_min">Duração (minutos)</Label>
            <Input
              id="duracao_min"
              name="duracao_min"
              type="number"
              min={1}
              step={1}
              defaultValue={servico?.duracao_min ?? 60}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preco">Preço</Label>
            <Input
              id="preco"
              name="preco"
              placeholder="89,90"
              defaultValue={
                servico ? formatCentavos(servico.preco_centavos).replace("R$", "").trim() : undefined
              }
              required
            />
          </div>
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
