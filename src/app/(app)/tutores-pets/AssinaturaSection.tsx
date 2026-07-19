"use client";

import { useEffect, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { assinarPlano, cancelarAssinatura } from "./planos-actions";

type PlanoOption = { id: string; nome: string; creditos_mes: number };

type AssinaturaInfo = {
  id: string;
  planoNome: string;
  creditosMes: number;
  usados: number;
};

export function AssinaturaSection({
  petId,
  planos,
}: {
  petId: string;
  planos: PlanoOption[];
}) {
  const [assinatura, setAssinatura] = useState<AssinaturaInfo | null | undefined>(
    undefined
  );
  const [selectedPlano, setSelectedPlano] = useState("");
  const [isPending, startTransition] = useTransition();

  async function carregar() {
    const supabase = createClient();
    const { data } = await supabase
      .from("assinaturas")
      .select("id, planos(nome, creditos_mes)")
      .eq("pet_id", petId)
      .eq("status", "ativa")
      .order("criado_em", { ascending: false })
      .limit(1);

    const row = data?.[0] as
      | { id: string; planos: { nome: string; creditos_mes: number } | null }
      | undefined;

    if (!row) {
      setAssinatura(null);
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

    const creditosMes = row.planos?.creditos_mes ?? 0;
    const saldo = saldoRow?.saldo ?? 0;
    setAssinatura({
      id: row.id,
      planoNome: row.planos?.nome ?? "",
      creditosMes,
      usados: Math.max(0, creditosMes - saldo),
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a assinatura ativa ao abrir/trocar de pet
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  function handleAssinar() {
    if (!selectedPlano) return;
    startTransition(async () => {
      const result = await assinarPlano(petId, selectedPlano);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Plano assinado.");
        setSelectedPlano("");
        void carregar();
      }
    });
  }

  function handleCancelar() {
    if (!assinatura) return;
    startTransition(async () => {
      const result = await cancelarAssinatura(assinatura.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Assinatura cancelada.");
        void carregar();
      }
    });
  }

  if (assinatura === undefined) {
    return <p className="text-xs text-muted-foreground">Carregando plano...</p>;
  }

  if (assinatura) {
    return (
      <div className="flex items-center justify-between rounded-[12px] bg-primary/5 px-2.5 py-1.5 text-xs">
        <span>
          <span className="font-medium text-primary">{assinatura.planoNome}</span>
          {" — "}
          {assinatura.usados} de {assinatura.creditosMes} usados este mês
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={handleCancelar}
        >
          Cancelar
        </Button>
      </div>
    );
  }

  if (planos.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedPlano}
        onChange={(event) => setSelectedPlano(event.target.value)}
        className="h-7 flex-1 rounded-[12px] border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">Assinar um plano...</option>
        {planos.map((plano) => (
          <option key={plano.id} value={plano.id}>
            {plano.nome} ({plano.creditos_mes}/mês)
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!selectedPlano || isPending}
        onClick={handleAssinar}
      >
        Assinar
      </Button>
    </div>
  );
}
