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
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { formatCentavos } from "@/lib/currency";
import { PORTES } from "@/lib/servico-preco";
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
              ? "O preço novo vale para os próximos agendamentos; os já marcados mantêm o valor."
              : "A duração define o tamanho do horário na agenda."}
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
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="duracao_min">Duração (min)</Label>
              <Input
                id="duracao_min"
                name="duracao_min"
                type="number"
                min={10}
                step={10}
                defaultValue={servico?.duracao_min ?? 60}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preco">Preço padrão</Label>
              <CurrencyInput
                id="preco"
                name="preco"
                defaultValue={
                  servico ? formatCentavos(servico.preco_centavos).replace("R$", "").trim() : undefined
                }
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-[12px] border border-border p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Preço por porte</span>
              <span className="text-xs text-muted-foreground">
                Opcional. Deixe em branco pra usar o preço acima. Na agenda, o valor é escolhido
                pelo porte do pet.
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PORTES.map((p) => {
                const atual =
                  p.valor === "pequeno"
                    ? servico?.preco_pequeno_centavos
                    : p.valor === "medio"
                      ? servico?.preco_medio_centavos
                      : servico?.preco_grande_centavos;
                return (
                  <div key={p.valor} className="flex flex-col gap-1">
                    <Label htmlFor={`preco_${p.valor}`} className="text-xs text-muted-foreground">
                      {p.label}
                    </Label>
                    <CurrencyInput
                      id={`preco_${p.valor}`}
                      name={`preco_${p.valor}`}
                      placeholder="—"
                      defaultValue={
                        atual != null ? formatCentavos(atual).replace("R$", "").trim() : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <SheetFooter className="flex-row justify-end px-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
