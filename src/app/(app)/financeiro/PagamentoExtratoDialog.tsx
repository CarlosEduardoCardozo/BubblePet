"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/shared/FormSelect";
import { formatCentavos } from "@/lib/currency";
import { calcularEntrada, hojeISO } from "@/lib/lancamentos";
import { aceitaParcelas, labelTipoMetodo, type MetodoPagamento } from "@/lib/pagamentos";

function dataBR(iso: string): string {
  return DateTime.fromISO(iso).toFormat("dd/LL/yyyy");
}

export type ExtratoAPagar = { id: string; tutorNome: string; totalCentavos: number };

/**
 * "Marcar pago" do Financeiro: pergunta como o cliente pagou e o valor entra
 * no Caixa daquele dia, já com a taxa e o prazo da forma de pagamento.
 */
export function PagamentoExtratoDialog({
  extrato,
  metodos,
  onOpenChange,
  onConfirmar,
}: {
  extrato: ExtratoAPagar | null;
  metodos: MetodoPagamento[];
  onOpenChange: (open: boolean) => void;
  onConfirmar: (pagamento: { metodoId: string; parcelas: number; data: string }) => Promise<string | null>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hoje = hojeISO();
  const [metodoId, setMetodoId] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [data, setData] = useState(hoje);

  const metodosAtivos = metodos.filter((m) => m.ativo);
  const metodo = metodosAtivos.find((m) => m.id === metodoId) ?? null;
  const podeParcelar = !!metodo && aceitaParcelas(metodo.tipo) && metodo.max_parcelas > 1;
  const parcelasEfetivas = podeParcelar ? Math.min(parcelas, metodo.max_parcelas) : 1;
  const total = extrato?.totalCentavos ?? 0;

  const previa = (() => {
    if (!metodo || total <= 0 || !data) return null;
    const linhas = calcularEntrada(total, parcelasEfetivas, metodo, data);
    const taxa = linhas.reduce((s, l) => s + l.taxa_centavos, 0);
    return { taxa, liquido: total - taxa, linhas };
  })();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null);
      setMetodoId("");
      setParcelas(1);
      setData(hojeISO());
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!metodo) return setError("Escolha a forma de pagamento.");
    if (!data) return setError("Informe a data do pagamento.");
    if (data > hoje) return setError("A data do pagamento não pode ser no futuro.");

    startTransition(async () => {
      const erro = await onConfirmar({ metodoId: metodo.id, parcelas: parcelasEfetivas, data });
      if (erro) setError(erro);
      else handleOpenChange(false);
    });
  }

  return (
    <Dialog open={!!extrato} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            {extrato ? `${extrato.tutorNome} · ${formatCentavos(total)}. ` : ""}
            O valor entra no Caixa do dia, já com a taxa da forma de pagamento.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pag-metodo">Forma de pagamento</Label>
            <FormSelect
              id="pag-metodo"
              value={metodoId}
              onValueChange={(id) => {
                setMetodoId(id);
                setParcelas(1);
              }}
              placeholder="Como o cliente pagou?"
              options={metodosAtivos.map((m) => ({
                value: m.id,
                label: m.descricao,
                hint: labelTipoMetodo(m.tipo),
              }))}
            />
            {metodosAtivos.length === 0 && (
              <p className="text-xs text-destructive">
                Nenhum método ativo. Cadastre em Configurações &gt; Pagamentos e caixas.
              </p>
            )}
          </div>

          <div className={podeParcelar ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-col"}>
            {podeParcelar && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pag-parcelas">Parcelas</Label>
                <FormSelect
                  id="pag-parcelas"
                  value={String(parcelasEfetivas)}
                  onValueChange={(v) => setParcelas(Number(v))}
                  options={Array.from({ length: metodo.max_parcelas }, (_, i) => ({
                    value: String(i + 1),
                    label: i === 0 ? "À vista" : `${i + 1}x`,
                  }))}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pag-data">Pago em</Label>
              <Input
                id="pag-data"
                type="date"
                value={data}
                max={hoje}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
          </div>

          {previa && (
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa</span>
                <span>{formatCentavos(previa.taxa)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Você recebe</span>
                <span>{formatCentavos(previa.liquido)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {previa.linhas.length === 1
                  ? `Cai em ${dataBR(previa.linhas[0].data_prevista)}.`
                  : `${previa.linhas.length} parcelas, de ${dataBR(previa.linhas[0].data_prevista)} a ${dataBR(previa.linhas[previa.linhas.length - 1].data_prevista)}.`}
                {previa.linhas[0].data_prevista > hoje ? "" : " Já entra como recebido."}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || metodosAtivos.length === 0}>
              {isPending ? "Salvando..." : "Marcar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
