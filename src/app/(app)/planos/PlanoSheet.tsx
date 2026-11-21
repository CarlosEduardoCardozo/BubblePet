"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
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
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect } from "@/components/shared/FormSelect";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
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
  const itensIniciais = () =>
    plano?.itens?.length
      ? plano.itens.map((i) => ({ servicoId: i.servico_id, quantidade: String(i.quantidade) }))
      : [{ servicoId: plano?.servico_id ?? "", quantidade: String(plano?.creditos_mes ?? 4) }];
  const [itens, setItens] = useState(itensIniciais);
  // Abriu outro plano (ou um novo): recomeça a lista.
  const chave = `${open}-${plano?.id ?? "new"}`;
  const [chaveAplicada, setChaveAplicada] = useState(chave);
  if (chave !== chaveAplicada) {
    setChaveAplicada(chave);
    setItens(itensIniciais());
  }

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function alterarItem(idx: number, campo: "servicoId" | "quantidade", valor: string) {
    setItens((atual) => atual.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set(
      "itens",
      JSON.stringify(itens.map((i) => ({ servico_id: i.servicoId, quantidade: i.quantidade })))
    );
    setError(null);
    startTransition(async () => {
      const result = plano
        ? await updatePlano(plano.id, formData)
        : await createPlano(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success(isEdit ? "Plano atualizado." : "Plano criado.");
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
              ? "Mudanças valem para todos os pets com esse plano."
              : "Serviços inclusos por mês por uma mensalidade fixa."}
          </SheetDescription>
        </SheetHeader>

        {servicos.length === 0 ? (
          <div className="flex flex-col gap-3 px-4 text-sm">
            <p className="rounded-xl bg-warning/10 px-3 py-2 text-warning-foreground">
              Cadastre um serviço antes de criar um plano — o plano cobre um serviço
              específico (ex.: Banho).
            </p>
            <Button variant="outline" nativeButton={false} render={<Link href="/servicos" />}>
              Ir para Serviços
            </Button>
          </div>
        ) : (
          <form
            key={plano?.id ?? "new"}
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nome">Nome do plano</Label>
              <Input
                id="nome"
                name="nome"
                placeholder="Plano Básico"
                defaultValue={plano?.nome}
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Serviços do plano (por mês)</Label>
                <button
                  type="button"
                  onClick={() => setItens((atual) => [...atual, { servicoId: "", quantidade: "1" }])}
                  disabled={itens.length >= servicos.length}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-40"
                >
                  <Plus size={12} /> Adicionar serviço
                </button>
              </div>
              {itens.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
                  <FormSelect
                    id={`item-servico-${idx}`}
                    value={item.servicoId}
                    onValueChange={(v) => alterarItem(idx, "servicoId", v)}
                    placeholder="Serviço"
                    options={servicos
                      .filter((s) => s.id === item.servicoId || !itens.some((o) => o.servicoId === s.id))
                      .map((servico) => ({
                        value: servico.id,
                        label: servico.nome,
                        hint: `${servico.duracao_min} min`,
                      }))}
                  />
                  <Input
                    aria-label="Quantidade por mês"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={item.quantidade}
                    onChange={(e) => alterarItem(idx, "quantidade", e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Tirar serviço do plano"
                    disabled={itens.length === 1}
                    onClick={() => setItens((atual) => atual.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Ex.: 4 Banho, 2 Hidratação e 1 Tosa higiênica. Cada serviço tem o próprio saldo no mês.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="preco">Mensalidade</Label>
                <CurrencyInput
                  id="preco"
                  name="preco"
                  defaultValue={
                    plano
                      ? formatCentavos(plano.preco_centavos).replace("R$", "").trim()
                      : undefined
                  }
                  required
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Ao ativar o plano num pet, os créditos do mês atual já ficam disponíveis.
              Todo dia 1 eles renovam sozinhos.
            </p>

            <Label className="flex items-start gap-2.5 rounded-xl border border-border p-3 font-normal">
              <Checkbox
                name="permite_acumular"
                defaultChecked={plano?.permite_acumular ?? false}
                className="mt-0.5"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Acumular sobra</span>
                <span className="text-xs text-muted-foreground">
                  Créditos não usados passam para o mês seguinte.
                </span>
              </span>
            </Label>

            {error && (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <SheetFooter className="flex-row justify-end px-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : isEdit ? "Salvar" : "Criar plano"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
