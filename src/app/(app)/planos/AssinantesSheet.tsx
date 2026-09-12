"use client";

import { useEffect, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Trash2, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { createClient } from "@/lib/supabase/client";
import { cancelarAssinatura } from "@/app/(app)/tutores-pets/planos-actions";

type Assinante = {
  assinaturaId: string;
  petNome: string;
  tutorNome: string;
  saldo: number;
};

// Embeds aninhados sem tipos gerados do banco às vezes voltam como array,
// às vezes como objeto — normaliza pra sempre pegar o primeiro.
function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

type Estado = { tipo: "carregando" } | { tipo: "erro" } | { tipo: "ok"; assinantes: Assinante[] };

export function AssinantesSheet({
  open,
  onOpenChange,
  planoId,
  planoNome,
  creditosMes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planoId: string;
  planoNome: string;
  creditosMes: number;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [removendo, setRemovendo] = useState<Assinante | null>(null);
  const [isPending, startTransition] = useTransition();

  async function carregar() {
    setEstado({ tipo: "carregando" });
    const supabase = createClient();

    const { data, error } = await supabase
      .from("assinaturas")
      .select("id, pets(nome, tutores(nome))")
      .eq("plano_id", planoId)
      .eq("status", "ativa")
      .order("criado_em");

    if (error) {
      setEstado({ tipo: "erro" });
      return;
    }

    const rows = (data ?? []) as unknown as {
      id: string;
      pets: { nome: string; tutores: { nome: string } | { nome: string }[] } | null;
    }[];

    if (rows.length === 0) {
      setEstado({ tipo: "ok", assinantes: [] });
      return;
    }

    const competencia = DateTime.now()
      .setZone("America/Sao_Paulo")
      .startOf("month")
      .toISODate();
    const assinaturaIds = rows.map((r) => r.id);
    const { data: saldos } = await supabase
      .from("saldo_creditos")
      .select("assinatura_id, saldo")
      .in("assinatura_id", assinaturaIds)
      .eq("competencia", competencia);

    const saldoPorAssinatura = new Map(
      (saldos ?? []).map((s) => [s.assinatura_id, s.saldo])
    );

    setEstado({
      tipo: "ok",
      assinantes: rows.map((row) => {
        const pet = one(row.pets);
        const tutor = one(pet?.tutores);
        return {
          assinaturaId: row.id,
          petNome: pet?.nome ?? "",
          tutorNome: tutor?.nome ?? "",
          saldo: saldoPorAssinatura.get(row.id) ?? 0,
        };
      }),
    });
  }

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- busca os assinantes ao abrir o sheet
      void carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planoId]);

  function handleRemover() {
    if (!removendo) return;
    const id = removendo.assinaturaId;
    startTransition(async () => {
      const result = await cancelarAssinatura(id);
      setRemovendo(null);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Plano cancelado para esse pet.");
        void carregar();
      }
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{planoNome}</SheetTitle>
            <SheetDescription>Pets com esse plano ativo e os créditos que ainda têm neste mês.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
            {estado.tipo === "carregando" && (
              <>
                <Skeleton className="h-14 w-full rounded-[12px]" />
                <Skeleton className="h-14 w-full rounded-[12px]" />
              </>
            )}

            {estado.tipo === "erro" && (
              <p className="text-sm text-destructive">
                Não foi possível carregar os assinantes.{" "}
                <button type="button" className="underline" onClick={() => void carregar()}>
                  Tentar de novo
                </button>
              </p>
            )}

            {estado.tipo === "ok" && estado.assinantes.length === 0 && (
              <EmptyState
                icon={Users}
                title="Nenhum pet nesse plano ainda"
                description="Ative o plano pelo card do pet, em Clientes e pets."
                className="py-8"
              />
            )}

            {estado.tipo === "ok" &&
              estado.assinantes.map((assinante) => (
                <div
                  key={assinante.assinaturaId}
                  className="flex items-center justify-between gap-2 rounded-[12px] border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{assinante.petNome}</p>
                    <p className="text-sm text-muted-foreground">
                      {assinante.tutorNome} · {assinante.saldo} de {creditosMes} créditos restantes
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Cancelar plano de ${assinante.petNome}`}
                    title="Cancelar plano deste pet"
                    disabled={isPending}
                    onClick={() => setRemovendo(assinante)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!removendo}
        onOpenChange={(o) => !o && setRemovendo(null)}
        title={`Cancelar o plano de ${removendo?.petNome ?? "este pet"}?`}
        description="Os créditos restantes deste mês são perdidos e a mensalidade deixa de entrar no fechamento."
        confirmLabel="Cancelar plano"
        pendingLabel="Cancelando..."
        onConfirm={handleRemover}
        pending={isPending}
      />
    </>
  );
}
