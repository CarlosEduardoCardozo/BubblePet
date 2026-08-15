"use client";

import { useEffect, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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

export function AssinantesSheet({
  open,
  onOpenChange,
  planoId,
  planoNome,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planoId: string;
  planoNome: string;
}) {
  const [assinantes, setAssinantes] = useState<Assinante[] | null>(null);
  const [isPending, startTransition] = useTransition();

  async function carregar() {
    setAssinantes(null);
    const supabase = createClient();

    const { data } = await supabase
      .from("assinaturas")
      .select("id, pets(nome, tutores(nome))")
      .eq("plano_id", planoId)
      .eq("status", "ativa")
      .order("criado_em");

    const rows = (data ?? []) as unknown as {
      id: string;
      pets: { nome: string; tutores: { nome: string } | { nome: string }[] } | null;
    }[];

    if (rows.length === 0) {
      setAssinantes([]);
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

    setAssinantes(
      rows.map((row) => {
        const pet = one(row.pets);
        const tutor = one(pet?.tutores);
        return {
          assinaturaId: row.id,
          petNome: pet?.nome ?? "",
          tutorNome: tutor?.nome ?? "",
          saldo: saldoPorAssinatura.get(row.id) ?? 0,
        };
      })
    );
  }

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- busca os assinantes ao abrir o sheet
      void carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planoId]);

  function handleRemover(assinaturaId: string) {
    startTransition(async () => {
      const result = await cancelarAssinatura(assinaturaId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Assinatura removida.");
        void carregar();
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assinantes — {planoNome}</SheetTitle>
          <SheetDescription>Pets com assinatura ativa nesse plano.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 overflow-y-auto px-4">
          {assinantes === null && (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          )}

          {assinantes?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum pet assinado nesse plano ainda.
            </p>
          )}

          {assinantes?.map((assinante) => (
            <div
              key={assinante.assinaturaId}
              className="flex items-center justify-between rounded-[12px] border border-border p-3"
            >
              <div>
                <p className="font-medium">{assinante.petNome}</p>
                <p className="text-sm text-muted-foreground">
                  {assinante.tutorNome} · {assinante.saldo} créditos restantes
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover assinatura de ${assinante.petNome}`}
                disabled={isPending}
                onClick={() => handleRemover(assinante.assinaturaId)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
