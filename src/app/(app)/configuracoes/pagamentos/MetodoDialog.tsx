"use client";

import { useState, useTransition } from "react";
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
import { FormSelect } from "@/components/shared/FormSelect";
import { parseCentavos } from "@/lib/currency";
import {
  aceitaParcelas,
  formatPercentual,
  MAX_PARCELAS,
  PARCELADO_MODOS,
  parsePercentual,
  PRAZOS,
  TIPOS_METODO,
  type Caixa,
  type MetodoInput,
  type MetodoPagamento,
  type ParceladoModo,
  type PrazoModo,
  type TipoMetodo,
} from "@/lib/pagamentos";
import { createMetodo, updateMetodo } from "./actions";

const CAIXA_PRINCIPAL = "principal";

function rotuloParcela(n: number): string {
  return n === 1 ? "Crédito à vista" : `Parcelado em ${n}x`;
}

function textoTaxaFixa(m?: MetodoPagamento | null): string {
  if (!m || m.taxa_fixa_valor === null) return "";
  return m.taxa_fixa_tipo === "reais"
    ? m.taxa_fixa_valor.toFixed(2).replace(".", ",")
    : formatPercentual(m.taxa_fixa_valor);
}

export function MetodoDialog({
  open,
  onOpenChange,
  metodo,
  caixas,
  usaVariosCaixas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metodo?: MetodoPagamento | null;
  caixas: Caixa[];
  usaVariosCaixas: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!metodo;

  const [tipo, setTipo] = useState<TipoMetodo>(metodo?.tipo ?? "maquina_cartao");
  const [descricao, setDescricao] = useState(metodo?.descricao ?? "");
  const [bandeira, setBandeira] = useState(metodo?.bandeira ?? "");
  const [caixaId, setCaixaId] = useState(metodo?.caixa_id ?? CAIXA_PRINCIPAL);
  const [taxaFixaTipo, setTaxaFixaTipo] = useState<"nenhuma" | "reais" | "percentual">(
    metodo?.taxa_fixa_tipo ?? "nenhuma"
  );
  const [taxaFixaValor, setTaxaFixaValor] = useState(textoTaxaFixa(metodo));
  const [prazoModo, setPrazoModo] = useState<PrazoModo>(metodo?.prazo_modo ?? "d1");
  const [prazoDias, setPrazoDias] = useState(String(metodo?.prazo_dias ?? 1));
  const [parceladoModo, setParceladoModo] = useState<ParceladoModo>(
    metodo?.parcelado_modo ?? "parcela_a_parcela"
  );
  const [maxParcelas, setMaxParcelas] = useState(metodo?.max_parcelas ?? 1);
  const [percentuais, setPercentuais] = useState<string[]>(() =>
    Array.from({ length: MAX_PARCELAS }, (_, i) => {
      const t = metodo?.taxas.find((x) => x.parcelas === i + 1);
      return t ? formatPercentual(t.percentual) : "";
    })
  );

  const parcelavel = aceitaParcelas(tipo);
  const linhas = parcelavel ? maxParcelas : 1;
  const caixasAtivos = caixas.filter((c) => c.ativo);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function trocarTipo(novo: string) {
    const t = novo as TipoMetodo;
    setTipo(t);
    if (aceitaParcelas(t) && maxParcelas === 1) setMaxParcelas(MAX_PARCELAS);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    let taxa_fixa_valor: number | null = null;
    if (taxaFixaTipo === "reais") {
      const centavos = parseCentavos(taxaFixaValor);
      if (centavos === null) return setError("Informe a taxa fixa em reais.");
      taxa_fixa_valor = centavos / 100;
    } else if (taxaFixaTipo === "percentual") {
      const pct = parsePercentual(taxaFixaValor);
      if (pct === null) return setError("Informe a taxa fixa em % (de 0 a 100).");
      taxa_fixa_valor = pct;
    }

    const dias = Number(prazoDias);
    if (prazoModo === "personalizado" && (!Number.isInteger(dias) || dias < 0 || dias > 365)) {
      return setError("O prazo personalizado deve ser de 0 a 365 dias.");
    }

    const taxas: { parcelas: number; percentual: number }[] = [];
    for (let i = 0; i < linhas; i++) {
      const texto = percentuais[i] ?? "";
      const pct = texto.trim() === "" ? 0 : parsePercentual(texto);
      if (pct === null) return setError(`Percentual inválido em "${rotuloParcela(i + 1)}".`);
      taxas.push({ parcelas: i + 1, percentual: pct });
    }

    const input: MetodoInput = {
      descricao,
      tipo,
      bandeira: bandeira.trim() || null,
      caixa_id: usaVariosCaixas && caixaId !== CAIXA_PRINCIPAL ? caixaId : null,
      taxa_fixa_tipo: taxaFixaTipo === "nenhuma" ? null : taxaFixaTipo,
      taxa_fixa_valor,
      prazo_modo: prazoModo,
      prazo_dias: Number.isInteger(dias) ? dias : 0,
      parcelado_modo: parceladoModo,
      max_parcelas: linhas,
      taxas,
    };

    startTransition(async () => {
      const result = metodo ? await updateMetodo(metodo.id, input) : await createMetodo(input);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success(isEdit ? "Método atualizado." : "Método cadastrado.");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar método de pagamento" : "Novo método de pagamento"}</DialogTitle>
          <DialogDescription>
            As taxas descontam do valor recebido. Mudar uma taxa vale só para os próximos lançamentos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metodo-tipo">Tipo</Label>
            <FormSelect
              id="metodo-tipo"
              value={tipo}
              onValueChange={trocarTipo}
              disabled={metodo?.sistema}
              options={TIPOS_METODO.map((t) => ({ value: t.valor, label: t.label }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metodo-descricao">Descrição</Label>
            <Input
              id="metodo-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Maquininha da Cielo"
              maxLength={60}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="metodo-bandeira">Marca / bandeira</Label>
              <Input
                id="metodo-bandeira"
                value={bandeira}
                onChange={(e) => setBandeira(e.target.value)}
                placeholder="Cielo, Elo, Mercado Pago..."
                maxLength={40}
              />
            </div>
            {usaVariosCaixas && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="metodo-caixa">Cai no caixa</Label>
                <FormSelect
                  id="metodo-caixa"
                  value={caixaId}
                  onValueChange={setCaixaId}
                  options={[
                    { value: CAIXA_PRINCIPAL, label: "Caixa principal" },
                    ...caixasAtivos.filter((c) => !c.principal).map((c) => ({ value: c.id, label: c.nome })),
                  ]}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Configurações de recebimento</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="taxa-fixa-tipo">Taxa fixa por parcela</Label>
                <FormSelect
                  id="taxa-fixa-tipo"
                  value={taxaFixaTipo}
                  onValueChange={(v) => {
                    setTaxaFixaTipo(v as "nenhuma" | "reais" | "percentual");
                    setTaxaFixaValor("");
                  }}
                  options={[
                    { value: "nenhuma", label: "Sem taxa fixa" },
                    { value: "reais", label: "Em reais (R$)" },
                    { value: "percentual", label: "Em percentual (%)" },
                  ]}
                />
              </div>
              {taxaFixaTipo !== "nenhuma" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="taxa-fixa-valor">{taxaFixaTipo === "reais" ? "Valor (R$)" : "Valor (%)"}</Label>
                  <Input
                    id="taxa-fixa-valor"
                    inputMode="decimal"
                    value={taxaFixaValor}
                    onChange={(e) => setTaxaFixaValor(e.target.value)}
                    placeholder={taxaFixaTipo === "reais" ? "0,50" : "1,00"}
                    required
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prazo-modo">Prazo para receber</Label>
                <FormSelect
                  id="prazo-modo"
                  value={prazoModo}
                  onValueChange={(v) => setPrazoModo(v as PrazoModo)}
                  options={PRAZOS.map((p) => ({ value: p.valor, label: p.label }))}
                />
              </div>
              {prazoModo === "personalizado" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="prazo-dias">Dias para receber</Label>
                  <Input
                    id="prazo-dias"
                    type="number"
                    min={0}
                    max={365}
                    value={prazoDias}
                    onChange={(e) => setPrazoDias(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold">{parcelavel ? "Taxas de parcelamento" : "Taxa de recebimento"}</h3>
              <p className="text-xs text-muted-foreground">
                Percentual descontado do valor. Em branco conta como 0%.
              </p>
            </div>

            {parcelavel && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="max-parcelas">Máximo de parcelas</Label>
                  <FormSelect
                    id="max-parcelas"
                    value={String(maxParcelas)}
                    onValueChange={(v) => setMaxParcelas(Number(v))}
                    options={Array.from({ length: MAX_PARCELAS }, (_, i) => ({
                      value: String(i + 1),
                      label: i === 0 ? "Só à vista" : `${i + 1}x`,
                    }))}
                  />
                </div>
                {maxParcelas > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="parcelado-modo">Parcelado cai</Label>
                    <FormSelect
                      id="parcelado-modo"
                      value={parceladoModo}
                      onValueChange={(v) => setParceladoModo(v as ParceladoModo)}
                      options={PARCELADO_MODOS.map((m) => ({ value: m.valor, label: m.label }))}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {Array.from({ length: linhas }, (_, i) => (
                <div key={i + 1} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`pct-${i + 1}`} className="text-sm font-medium">
                    {parcelavel ? rotuloParcela(i + 1) : "À vista"}
                  </Label>
                  <div className="relative w-28">
                    <Input
                      id={`pct-${i + 1}`}
                      inputMode="decimal"
                      value={percentuais[i] ?? ""}
                      onChange={(e) =>
                        setPercentuais((atual) => atual.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      placeholder="0,00"
                      className="pr-7 text-right"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
