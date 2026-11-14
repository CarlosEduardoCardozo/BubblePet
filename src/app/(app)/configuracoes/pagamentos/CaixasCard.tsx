"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Landmark, Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alternar } from "@/components/shared/Alternar";
import { FormSelect } from "@/components/shared/FormSelect";
import { labelTipoCaixa, TIPOS_CAIXA, type Caixa, type TipoCaixa } from "@/lib/pagamentos";
import { createCaixa, setCaixaAtivo, setUsaVariosCaixas, updateCaixa } from "./actions";

function CaixaDialog({
  open,
  onOpenChange,
  caixa,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caixa?: Caixa | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState(caixa?.nome ?? "");
  const [tipo, setTipo] = useState<TipoCaixa>(caixa?.tipo ?? "banco");
  const isEdit = !!caixa;

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = caixa ? await updateCaixa(caixa.id, { nome, tipo }) : await createCaixa({ nome, tipo });
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success(isEdit ? "Caixa atualizado." : "Caixa criado.");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar caixa" : "Novo caixa"}</DialogTitle>
          <DialogDescription>
            Um caixa é um lugar onde o dinheiro entra: o balcão, uma conta bancária, uma maquininha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caixa-nome">Nome</Label>
            <Input
              id="caixa-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Conta Nubank"
              maxLength={40}
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caixa-tipo">Tipo</Label>
            <FormSelect
              id="caixa-tipo"
              value={tipo}
              onValueChange={(v) => setTipo(v as TipoCaixa)}
              options={TIPOS_CAIXA.map((t) => ({ value: t.valor, label: t.label }))}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CaixasCard({ caixas, usaVarios }: { caixas: Caixa[]; usaVarios: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [formTarget, setFormTarget] = useState<"new" | string | null>(null);

  const editando = typeof formTarget === "string" && formTarget !== "new"
    ? (caixas.find((c) => c.id === formTarget) ?? null)
    : null;

  function alternarModo(ligado: boolean) {
    startTransition(async () => {
      const result = await setUsaVariosCaixas(ligado);
      if ("error" in result) toast.error(result.error);
      else toast.success(ligado ? "Agora você usa mais de um caixa." : "Voltou para um caixa só.");
    });
  }

  function alternarAtivo(caixa: Caixa) {
    startTransition(async () => {
      const result = await setCaixaAtivo(caixa.id, !caixa.ativo);
      if ("error" in result) toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-card glass p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Landmark size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold">Caixas</h2>
            <p className="text-sm text-muted-foreground">
              {usaVarios
                ? "Cada recebimento cai em um caixa. Os métodos de pagamento podem apontar para o caixa deles."
                : "Hoje tudo entra em um caixa só. Ligue a opção ao lado se o dinheiro cai em lugares diferentes (balcão e banco, por exemplo)."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-sm font-medium sm:inline">Vários caixas</span>
          <Alternar ligado={usaVarios} onChange={alternarModo} rotulo="Usar mais de um caixa" disabled={isPending} />
        </div>
      </div>

      {usaVarios && (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-white/60">
            {caixas.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={c.ativo ? "text-sm font-medium" : "text-sm font-medium text-muted-foreground"}>
                    {c.nome}
                  </span>
                  <span className="text-xs text-muted-foreground">{labelTipoCaixa(c.tipo)}</span>
                </div>
                {c.principal && <Badge variant="secondary">Principal</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${c.nome}`}
                  title="Editar caixa"
                  onClick={() => setFormTarget(c.id)}
                >
                  <Pencil size={16} />
                </Button>
                <Alternar
                  ligado={c.ativo}
                  onChange={() => alternarAtivo(c)}
                  rotulo={`${c.ativo ? "Desativar" : "Ativar"} ${c.nome}`}
                  disabled={isPending || c.principal}
                />
              </li>
            ))}
          </ul>
          <div>
            <Button variant="outline" onClick={() => setFormTarget("new")}>
              <Plus size={16} /> Novo caixa
            </Button>
          </div>
        </div>
      )}

      <CaixaDialog
        key={formTarget ?? "fechado"}
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        caixa={editando}
      />
    </section>
  );
}
