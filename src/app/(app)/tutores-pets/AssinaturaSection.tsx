"use client";

import { useEffect, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormSelect } from "@/components/shared/FormSelect";
import { createClient } from "@/lib/supabase/client";
import { assinarPlano, cancelarAssinatura } from "./planos-actions";

type PlanoOption = { id: string; nome: string; creditos_mes: number };

type AssinaturaInfo = {
  id: string;
  planoNome: string;
  creditosMes: number;
  saldo: number;
};

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
  const [isPending, startTransition] = useTransition();

  async function carregar() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("assinaturas")
      .select("id, planos(nome, creditos_mes)")
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
      | { id: string; planos: { nome: string; creditos_mes: number } | null }
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
      },
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a assinatura ativa ao abrir/trocar de pet
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  function handleAssinar(planoId: string) {
    if (!planoId) return;
    setSelectedPlano(planoId);
    startTransition(async () => {
      const result = await assinarPlano(petId, planoId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Plano ativado. Os créditos deste mês já estão disponíveis.");
      }
      setSelectedPlano("");
      void carregar();
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
        <div className="flex items-center justify-between gap-2 rounded-[12px] bg-primary/5 px-2.5 py-1.5 text-xs">
          <span>
            <span className="font-medium text-primary">{assinatura.planoNome}</span>
            {" — "}
            {assinatura.saldo} de {assinatura.creditosMes} créditos restantes
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

  return (
    <FormSelect
      value={selectedPlano}
      onValueChange={handleAssinar}
      disabled={isPending}
      placeholder={isPending ? "Ativando..." : "Sem plano — ativar um plano..."}
      className="h-8 text-xs"
      options={planos.map((plano) => ({
        value: plano.id,
        label: plano.nome,
        hint: `${plano.creditos_mes} banho${plano.creditos_mes === 1 ? "" : "s"} por mês`,
      }))}
    />
  );
}
