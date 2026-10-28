"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { FidelidadeConfig } from "@/lib/fidelidade";
import { salvarConfigFidelidade, type ConfigFidelidadeForm } from "./actions";

export function ConfigFidelidadeSheet({
  open,
  onOpenChange,
  config,
  servicos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: FidelidadeConfig;
  servicos: { id: string; nome: string }[];
}) {
  const [form, setForm] = useState<ConfigFidelidadeForm>({ ...config });
  const [isPending, startTransition] = useTransition();
  const todos = !form.servico_ids;

  function alternarServico(id: string, marcado: boolean) {
    setForm((f) => {
      const atual = f.servico_ids ?? [];
      return { ...f, servico_ids: marcado ? [...atual, id] : atual.filter((s) => s !== id) };
    });
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (form.servico_ids && form.servico_ids.length === 0) {
      toast.error("Escolha pelo menos um serviço, ou marque que todos contam.");
      return;
    }
    startTransition(async () => {
      const r = await salvarConfigFidelidade(form);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Regras do programa salvas.");
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Regras do programa de fidelidade</SheetTitle>
          <SheetDescription>Mudar as regras recalcula todos os cartões na hora.</SheetDescription>
        </SheetHeader>
        <form onSubmit={salvar} className="flex flex-col gap-5 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta">Atendimentos para ganhar o prêmio</Label>
            <div className="flex items-center gap-2">
              <Input
                id="meta"
                type="number"
                min={2}
                max={50}
                className="w-28"
                value={form.meta}
                onChange={(e) => setForm((f) => ({ ...f, meta: e.target.value }))}
              />
              <span className="text-sm text-muted-foreground">atendimentos pagos</span>
            </div>
            <p className="text-xs text-muted-foreground">O mais comum é 10 (o 11º sai de graça).</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="premio">Nome do prêmio</Label>
            <Input
              id="premio"
              value={form.premio}
              maxLength={60}
              onChange={(e) => setForm((f) => ({ ...f, premio: e.target.value }))}
              placeholder="Ex.: Banho grátis, Hidratação de presente"
            />
            <p className="text-xs text-muted-foreground">É assim que o cliente vê no WhatsApp.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desconto_pct">Desconto do prêmio</Label>
            <div className="flex items-center gap-2">
              <Input
                id="desconto_pct"
                type="number"
                min={5}
                max={100}
                className="w-28"
                value={form.desconto_pct}
                onChange={(e) => setForm((f) => ({ ...f, desconto_pct: e.target.value }))}
              />
              <span className="text-sm text-muted-foreground">% do valor do atendimento</span>
            </div>
            <p className="text-xs text-muted-foreground">100% = atendimento grátis. Os adicionais continuam sendo cobrados.</p>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white/50 p-4">
            <Label className="flex items-start gap-2.5 font-normal">
              <Checkbox
                checked={todos}
                onCheckedChange={(v) => setForm((f) => ({ ...f, servico_ids: v === true ? null : [] }))}
              />
              <span className="text-sm">Todos os serviços contam carimbo</span>
            </Label>
            {!todos && (
              <div className="flex flex-col gap-2 pl-1">
                {servicos.map((s) => (
                  <Label key={s.id} className="flex items-center gap-2.5 font-normal">
                    <Checkbox
                      checked={form.servico_ids?.includes(s.id) ?? false}
                      onCheckedChange={(v) => alternarServico(s.id, v === true)}
                    />
                    <span className="text-sm">{s.nome}</span>
                  </Label>
                ))}
                <p className="text-xs text-muted-foreground">O prêmio também só vale nesses serviços.</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contar_desde">Contar atendimentos a partir de</Label>
            <Input
              id="contar_desde"
              type="date"
              className="w-44"
              value={form.contar_desde}
              onChange={(e) => setForm((f) => ({ ...f, contar_desde: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Dá pra começar com os atendimentos que já aconteceram.</p>
          </div>

          <Label className="flex items-start gap-2.5 rounded-2xl border border-border bg-white/50 p-4 font-normal">
            <Checkbox
              checked={form.avisar_whatsapp}
              onCheckedChange={(v) => setForm((f) => ({ ...f, avisar_whatsapp: v === true }))}
            />
            <span className="text-sm">
              Avisar o cliente pelo WhatsApp quando ele ganhar o prêmio
              <span className="block text-xs text-muted-foreground">
                Sai no mesmo horário e intervalo das mensagens de retorno. O &quot;pode buscar&quot; também mostra quantos carimbos ele tem.
              </span>
            </span>
          </Label>

          <SheetFooter className="flex-row justify-end px-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar regras"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
