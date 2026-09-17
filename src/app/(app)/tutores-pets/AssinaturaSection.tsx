"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormSelect } from "@/components/shared/FormSelect";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { createClient } from "@/lib/supabase/client";
import { formatCentavos, parseCentavos } from "@/lib/currency";
import { assinarPlano, atualizarPrecoAssinatura, cancelarAssinatura } from "./planos-actions";

type PlanoOption = { id: string; nome: string; creditos_mes: number; preco_centavos: number };

type AssinaturaInfo = {
  id: string;
  planoNome: string;
  creditosMes: number;
  saldo: number;
  /** Valor que o pet paga por mês (o do pet, se combinado, senão o do plano). */
  precoCentavos: number;
  precoPlanoCentavos: number;
  precoEspecial: boolean;
};

function paraInput(centavos: number): string {
  return formatCentavos(centavos).replace("R$", "").trim();
}

type Estado = { tipo: "carregando" } | { tipo: "erro" } | { tipo: "ok"; assinatura: AssinaturaInfo | null };

export function AssinaturaSection({
  petId,
  petNome,
  planos,
}: {
  petId: string;
  petNome?: string;
  planos: PlanoOption[];
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [selectedPlano, setSelectedPlano] = useState("");
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  // Plano escolhido esperando o valor ser confirmado / valor em edição.
  const [precoNovo, setPrecoNovo] = useState("");
  const [editandoPreco, setEditandoPreco] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function carregar() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("assinaturas")
      .select("id, preco_centavos, planos(nome, creditos_mes, preco_centavos)")
      .eq("pet_id", petId)
      .eq("status", "ativa")
      .order("criado_em", { ascending: false })
      .limit(1);

    if (error) {
      setEstado({ tipo: "erro" });
      return;
    }

    // planos é many-to-one (objeto) na API real; a inferência do supabase-js
    // sem tipos gerados acha que é array.
    const row = data?.[0] as unknown as
      | {
          id: string;
          preco_centavos: number | null;
          planos: { nome: string; creditos_mes: number; preco_centavos: number } | null;
        }
      | undefined;

    if (!row) {
      setEstado({ tipo: "ok", assinatura: null });
      return;
    }

    const competencia = DateTime.now()
      .setZone("America/Sao_Paulo")
      .startOf("month")
      .toISODate();
    const { data: saldoRow } = await supabase
      .from("saldo_creditos")
      .select("saldo")
      .eq("assinatura_id", row.id)
      .eq("competencia", competencia)
      .maybeSingle();

    setEstado({
      tipo: "ok",
      assinatura: {
        id: row.id,
        planoNome: row.planos?.nome ?? "",
        creditosMes: row.planos?.creditos_mes ?? 0,
        saldo: saldoRow?.saldo ?? 0,
        precoCentavos: row.preco_centavos ?? row.planos?.preco_centavos ?? 0,
        precoPlanoCentavos: row.planos?.preco_centavos ?? 0,
        precoEspecial: row.preco_centavos != null,
      },
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a assinatura ativa ao abrir/trocar de pet
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  function escolherPlano(planoId: string) {
    setSelectedPlano(planoId);
    const plano = planos.find((p) => p.id === planoId);
    setPrecoNovo(plano ? paraInput(plano.preco_centavos) : "");
  }

  function lerPreco(): number | null | undefined {
    if (!precoNovo.trim()) return null;
    const centavos = parseCentavos(precoNovo);
    if (centavos == null) {
      toast.error("Valor inválido. Ex.: 120,00");
      return undefined;
    }
    return centavos;
  }

  function handleAssinar() {
    if (!selectedPlano) return;
    const preco = lerPreco();
    if (preco === undefined) return;
    startTransition(async () => {
      const result = await assinarPlano(petId, selectedPlano, preco);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Plano ativado. Os créditos deste mês já estão disponíveis.");
        setSelectedPlano("");
      }
      void carregar();
    });
  }

  function handleSalvarPreco() {
    if (estado.tipo !== "ok" || !estado.assinatura) return;
    const preco = lerPreco();
    if (preco === undefined) return;
    const id = estado.assinatura.id;
    startTransition(async () => {
      const result = await atualizarPrecoAssinatura(id, preco);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Valor do plano atualizado para este pet.");
        setEditandoPreco(false);
        void carregar();
      }
    });
  }

  function handleCancelar() {
    if (estado.tipo !== "ok" || !estado.assinatura) return;
    const id = estado.assinatura.id;
    startTransition(async () => {
      const result = await cancelarAssinatura(id);
      setConfirmCancelar(false);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Plano cancelado.");
        void carregar();
      }
    });
  }

  if (estado.tipo === "carregando") {
    return <div className="h-8 animate-pulse rounded-[8px] bg-muted" aria-label="Carregando plano" />;
  }

  if (estado.tipo === "erro") {
    return (
      <p className="text-xs text-destructive">
        Não foi possível carregar o plano.{" "}
        <button type="button" className="underline" onClick={() => void carregar()}>
          Tentar de novo
        </button>
      </p>
    );
  }

  const { assinatura } = estado;

  if (assinatura) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-primary/5 px-2.5 py-1.5 text-xs">
          <span className="flex flex-col">
            <span>
              <span className="font-medium text-primary">{assinatura.planoNome}</span>
              {" — "}
              {assinatura.saldo} de {assinatura.creditosMes} créditos restantes
            </span>
            {editandoPreco ? (
              <span className="mt-1 flex items-center gap-1">
                <span className="w-28">
                  <CurrencyInput
                    value={precoNovo}
                    onChange={(e) => setPrecoNovo(e.target.value)}
                    className="h-7 text-xs"
                    aria-label="Valor mensal para este pet"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSalvarPreco();
                      }
                    }}
                  />
                </span>
                <Button type="button" size="icon-xs" onClick={handleSalvarPreco} disabled={isPending} aria-label="Salvar valor">
                  <Check size={12} />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setEditandoPreco(false)}
                  disabled={isPending}
                  aria-label="Cancelar edição do valor"
                >
                  <X size={12} />
                </Button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPrecoNovo(paraInput(assinatura.precoCentavos));
                  setEditandoPreco(true);
                }}
                className="mt-0.5 flex items-center gap-1 self-start text-muted-foreground hover:text-foreground"
                title="Mudar o valor só para este pet"
              >
                {formatCentavos(assinatura.precoCentavos)}/mês
                {assinatura.precoEspecial && (
                  <span className="text-muted-foreground">
                    {" "}(valor especial · plano {formatCentavos(assinatura.precoPlanoCentavos)})
                  </span>
                )}
                <Pencil size={10} />
              </button>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            disabled={isPending}
            onClick={() => setConfirmCancelar(true)}
          >
            Cancelar plano
          </Button>
        </div>
        <ConfirmDialog
          open={confirmCancelar}
          onOpenChange={setConfirmCancelar}
          title={`Cancelar o plano de ${petNome ?? "este pet"}?`}
          description="Os créditos restantes deste mês são perdidos e a mensalidade deixa de entrar no fechamento. Dá pra assinar de novo depois."
          confirmLabel="Cancelar plano"
          pendingLabel="Cancelando..."
          onConfirm={handleCancelar}
          pending={isPending}
        />
      </>
    );
  }

  if (planos.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem plano. Cadastre planos em Planos.</p>;
  }

  const planoEscolhido = planos.find((p) => p.id === selectedPlano);

  return (
    <div className="flex flex-col gap-2">
      <FormSelect
        value={selectedPlano}
        onValueChange={escolherPlano}
        disabled={isPending}
        placeholder="Sem plano — ativar um plano..."
        className="h-8 text-xs"
        options={planos.map((plano) => ({
          value: plano.id,
          label: plano.nome,
          hint: `${plano.creditos_mes} banho${plano.creditos_mes === 1 ? "" : "s"} por mês · ${formatCentavos(plano.preco_centavos)}`,
        }))}
      />
      {planoEscolhido && (
        <div className="flex flex-wrap items-end gap-2 rounded-[12px] border border-border p-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Valor mensal para {petNome ?? "este pet"}</span>
            <span className="w-32">
              <CurrencyInput
                value={precoNovo}
                onChange={(e) => setPrecoNovo(e.target.value)}
                className="h-8 text-xs"
              />
            </span>
          </label>
          <div className="ml-auto flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedPlano("")} disabled={isPending}>
              Voltar
            </Button>
            <Button type="button" size="sm" onClick={handleAssinar} disabled={isPending}>
              {isPending ? "Ativando..." : "Ativar plano"}
            </Button>
          </div>
          <span className="w-full text-[11px] text-muted-foreground">
            Base do plano: {formatCentavos(planoEscolhido.preco_centavos)}. Esse é o valor que entra no
            fechamento do cliente.
          </span>
        </div>
      )}
    </div>
  );
}
