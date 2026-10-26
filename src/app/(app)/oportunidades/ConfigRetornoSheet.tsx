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
import type { RetornoConfig } from "@/lib/retorno/calcular";
import { salvarConfigRetorno, type ConfigForm } from "./actions";

function Campo({
  id,
  label,
  ajuda,
  sufixo,
  ...input
}: React.ComponentProps<typeof Input> & { id: string; label: string; ajuda?: string; sufixo?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} {...input} className="w-28" />
        {sufixo && <span className="text-sm text-muted-foreground">{sufixo}</span>}
      </div>
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

export function ConfigRetornoSheet({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: RetornoConfig;
}) {
  const [form, setForm] = useState<ConfigForm>({ ...config });
  const [isPending, startTransition] = useTransition();
  const set = (campo: keyof ConfigForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await salvarConfigRetorno(form);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Regras salvas. A fila de hoje é refeita na próxima rodada.");
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Regras das mensagens de retorno</SheetTitle>
          <SheetDescription>
            Mensagens bem espaçadas protegem o número do petshop: muitas seguidas podem levar a bloqueio no WhatsApp.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={salvar} className="flex flex-col gap-5 px-4 pb-4">
          <div className="grid grid-cols-2 gap-4">
            <Campo id="janela_inicio" label="Envia a partir de" type="time" value={form.janela_inicio} onChange={set("janela_inicio")} />
            <Campo id="janela_fim" label="Até" type="time" value={form.janela_fim} onChange={set("janela_fim")} />
          </div>
          <Campo
            id="intervalo_envio_min"
            label="Intervalo entre mensagens"
            type="number"
            min={5}
            max={120}
            sufixo="minutos"
            ajuda="Recomendado: 15 a 30 minutos."
            value={form.intervalo_envio_min}
            onChange={set("intervalo_envio_min")}
          />
          <Campo id="limite_dia" label="Máximo por dia" type="number" min={1} max={50} sufixo="mensagens" value={form.limite_dia} onChange={set("limite_dia")} />
          <Campo
            id="dias_antes"
            label="Avisar antes da data prevista"
            type="number"
            min={0}
            max={15}
            sufixo="dias"
            ajuda="A data prevista vem do ritmo de cada pet (ex.: vem a cada 30 dias)."
            value={form.dias_antes}
            onChange={set("dias_antes")}
          />
          <Campo
            id="intervalo_padrao_dias"
            label="Pet que veio só uma vez volta em"
            type="number"
            min={7}
            max={120}
            sufixo="dias"
            value={form.intervalo_padrao_dias}
            onChange={set("intervalo_padrao_dias")}
          />
          <Campo
            id="reenviar_apos_dias"
            label="Não mandar de novo pro mesmo pet antes de"
            type="number"
            min={7}
            max={90}
            sufixo="dias"
            value={form.reenviar_apos_dias}
            onChange={set("reenviar_apos_dias")}
          />
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white/50 p-4">
            <Label className="flex items-start gap-2.5 font-normal">
              <Checkbox
                checked={form.avisar_plano_sobrando}
                onCheckedChange={(v) => setForm((f) => ({ ...f, avisar_plano_sobrando: v === true }))}
              />
              <span className="text-sm">Avisar quem ainda tem banho do plano sobrando no fim do mês</span>
            </Label>
            <Campo
              id="dias_fim_mes"
              label="Nos últimos"
              type="number"
              min={3}
              max={20}
              sufixo="dias do mês"
              value={form.dias_fim_mes}
              onChange={set("dias_fim_mes")}
            />
          </div>
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
