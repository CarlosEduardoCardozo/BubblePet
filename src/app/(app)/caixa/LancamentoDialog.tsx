"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
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
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormSelect } from "@/components/shared/FormSelect";
import { formatCentavos, parseCentavos } from "@/lib/currency";
import { calcularEntrada, hojeISO } from "@/lib/lancamentos";
import { aceitaParcelas, labelTipoMetodo, type Caixa, type MetodoPagamento } from "@/lib/pagamentos";
import { criarLancamento } from "./actions";

export type CategoriaOpcao = { id: string; nome: string; tipo: "entrada" | "saida" };

const SEM_CATEGORIA = "sem";
const SEM_METODO = "sem";
const CAIXA_AUTOMATICO = "auto";

function dataBR(iso: string): string {
  return DateTime.fromISO(iso).toFormat("dd/LL/yyyy");
}

export function LancamentoDialog({
  open,
  onOpenChange,
  tipoInicial,
  dataInicial,
  metodos,
  categorias,
  caixas,
  usaVariosCaixas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipoInicial: "entrada" | "saida";
  dataInicial: string;
  metodos: MetodoPagamento[];
  categorias: CategoriaOpcao[];
  caixas: Caixa[];
  usaVariosCaixas: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState<"entrada" | "saida">(tipoInicial);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(dataInicial);
  const [categoriaId, setCategoriaId] = useState(SEM_CATEGORIA);
  const [metodoId, setMetodoId] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [caixaId, setCaixaId] = useState(CAIXA_AUTOMATICO);
  const [pago, setPago] = useState(true);

  const ehEntrada = tipo === "entrada";
  const metodosAtivos = metodos.filter((m) => m.ativo);
  const metodo = metodosAtivos.find((m) => m.id === metodoId) ?? null;
  const podeParcelar = !!metodo && ehEntrada && aceitaParcelas(metodo.tipo) && metodo.max_parcelas > 1;
  const parcelasEfetivas = podeParcelar ? Math.min(parcelas, metodo.max_parcelas) : 1;
  const categoriasDoTipo = categorias.filter((c) => c.tipo === tipo);

  const centavos = parseCentavos(valor);

  // Mostra na hora quanto vai de taxa e quando o dinheiro cai.
  const previa = (() => {
    if (!ehEntrada || !metodo || !centavos || centavos <= 0 || !data) return null;
    const linhas = calcularEntrada(centavos, parcelasEfetivas, metodo, data);
    const taxa = linhas.reduce((s, l) => s + l.taxa_centavos, 0);
    return { taxa, liquido: centavos - taxa, linhas };
  })();

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function trocarTipo(novo: "entrada" | "saida") {
    setTipo(novo);
    setCategoriaId(SEM_CATEGORIA);
    setParcelas(1);
  }

  function trocarMetodo(id: string) {
    setMetodoId(id === SEM_METODO ? "" : id);
    setParcelas(1);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!centavos || centavos <= 0) return setError("Informe um valor maior que zero.");
    if (ehEntrada && !metodo) return setError("Escolha a forma de pagamento.");

    startTransition(async () => {
      const result = await criarLancamento({
        tipo,
        valor_centavos: centavos,
        descricao: descricao.trim() || null,
        categoria_id: categoriaId === SEM_CATEGORIA ? null : categoriaId,
        data,
        metodo_id: metodo?.id ?? null,
        caixa_id: usaVariosCaixas && caixaId !== CAIXA_AUTOMATICO ? caixaId : null,
        parcelas: parcelasEfetivas,
        pago: ehEntrada ? true : pago,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success(ehEntrada ? "Entrada lançada." : pago ? "Despesa lançada." : "Despesa agendada.");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
          <DialogDescription>
            {ehEntrada
              ? "Registre um recebimento. A taxa do método e o prazo para o dinheiro cair entram na conta."
              : "Registre uma despesa que já foi paga ou que vence numa data."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div role="tablist" aria-label="Tipo de lançamento" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(["entrada", "saida"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tipo === t}
                onClick={() => trocarTipo(t)}
                className={
                  tipo === t
                    ? "rounded-lg bg-white px-3 py-1.5 text-sm font-semibold shadow-sm"
                    : "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground"
                }
              >
                {t === "entrada" ? "Entrada" : "Despesa"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lanc-valor">Valor</Label>
              <CurrencyInput
                id="lanc-valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lanc-data">{ehEntrada || pago ? "Data" : "Vencimento"}</Label>
              <Input id="lanc-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lanc-descricao">Descrição</Label>
            <Input
              id="lanc-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={ehEntrada ? "Banho do Thor" : "Aluguel de novembro"}
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lanc-categoria">Categoria</Label>
            <FormSelect
              id="lanc-categoria"
              value={categoriaId}
              onValueChange={setCategoriaId}
              options={[
                { value: SEM_CATEGORIA, label: "Sem categoria" },
                ...categoriasDoTipo.map((c) => ({ value: c.id, label: c.nome })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lanc-metodo">{ehEntrada ? "Forma de pagamento" : "Pago com (opcional)"}</Label>
            <FormSelect
              id="lanc-metodo"
              value={metodoId || SEM_METODO}
              onValueChange={trocarMetodo}
              placeholder="Escolha o método"
              options={[
                ...(ehEntrada ? [] : [{ value: SEM_METODO, label: "Não informar" }]),
                ...metodosAtivos.map((m) => ({
                  value: m.id,
                  label: m.descricao,
                  hint: labelTipoMetodo(m.tipo),
                })),
              ]}
            />
            {ehEntrada && metodosAtivos.length === 0 && (
              <p className="text-xs text-destructive">
                Nenhum método ativo. Cadastre em Configurações &gt; Pagamentos e caixas.
              </p>
            )}
          </div>

          {podeParcelar && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lanc-parcelas">Parcelas</Label>
              <FormSelect
                id="lanc-parcelas"
                value={String(parcelasEfetivas)}
                onValueChange={(v) => setParcelas(Number(v))}
                options={Array.from({ length: metodo.max_parcelas }, (_, i) => ({
                  value: String(i + 1),
                  label: i === 0 ? "À vista" : `${i + 1}x`,
                }))}
              />
            </div>
          )}

          {usaVariosCaixas && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lanc-caixa">Caixa</Label>
              <FormSelect
                id="lanc-caixa"
                value={caixaId}
                onValueChange={setCaixaId}
                options={[
                  { value: CAIXA_AUTOMATICO, label: "Automático (do método)" },
                  ...caixas.filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome })),
                ]}
              />
            </div>
          )}

          {!ehEntrada && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pago}
                onChange={(e) => setPago(e.target.checked)}
                className="size-4 accent-primary"
              />
              Já foi paga
            </label>
          )}

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
                {previa.linhas[0].data_prevista > hojeISO() ? "" : " Já entra como recebido."}
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Lançar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
