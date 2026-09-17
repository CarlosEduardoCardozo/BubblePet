"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, SearchX, Wallet, RotateCcw } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatCentavos } from "@/lib/currency";
import { PlanoSheet } from "./PlanoSheet";
import { AssinantesSheet } from "./AssinantesSheet";
import { deletePlano } from "./actions";

export type Plano = {
  id: string;
  nome: string;
  creditos_mes: number;
  preco_centavos: number;
  permite_acumular: boolean;
  servico_id: string;
  servicoNome: string;
};

export type ServicoOption = { id: string; nome: string; duracao_min: number };

export function PlanosTable({
  planos,
  busca,
  page,
  totalPages,
  servicos,
  assinantesPorPlano,
  receitaPorPlano,
  receitaRecorrenteCentavos,
  totalPlanos,
}: {
  planos: Plano[];
  busca: string;
  page: number;
  totalPages: number;
  servicos: ServicoOption[];
  assinantesPorPlano: Record<string, number>;
  receitaPorPlano: Record<string, number>;
  receitaRecorrenteCentavos: number;
  totalPlanos: number;
}) {
  const [formTarget, setFormTarget] = useState<"new" | string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assinantesPlanoId, setAssinantesPlanoId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editingPlano =
    typeof formTarget === "string"
      ? (planos.find((p) => p.id === formTarget) ?? null)
      : null;
  const deletingPlano = planos.find((p) => p.id === deletingId) ?? null;
  const assinantesPlano = planos.find((p) => p.id === assinantesPlanoId) ?? null;

  function handleDelete() {
    if (!deletingId) return;
    const nome = deletingPlano?.nome ?? "Plano";
    startTransition(async () => {
      const result = await deletePlano(deletingId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`${nome} desativado.`);
        setDeletingId(null);
      }
    });
  }

  const subtitulo =
    totalPlanos === 0
      ? "Crie planos de banho com créditos mensais"
      : `${totalPlanos} plano${totalPlanos === 1 ? "" : "s"} · receita recorrente de ${formatCentavos(receitaRecorrenteCentavos)}/mês`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Planos"
        description={subtitulo}
        action={
          <Button onClick={() => setFormTarget("new")}>
            <Plus size={16} /> Novo plano
          </Button>
        }
      />

      <SearchInput placeholder="Buscar plano..." />

      {planos.length === 0 ? (
        busca ? (
          <EmptyState
            icon={SearchX}
            title={`Nenhum plano encontrado para “${busca}”`}
            action={
              <Button variant="outline" nativeButton={false} render={<Link href="/planos" />}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Wallet}
            title="Nenhum plano cadastrado ainda"
            description="Um plano dá ao pet um número de banhos por mês por uma mensalidade fixa. Ex.: Plano Básico — 4 banhos por R$ 180,00."
            action={
              <Button onClick={() => setFormTarget("new")}>
                <Plus size={16} /> Criar o primeiro plano
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Banhos por mês</TableHead>
                <TableHead>Mensalidade</TableHead>
                <TableHead className="hidden md:table-cell">Pets no plano</TableHead>
                <TableHead className="hidden lg:table-cell">Receita/mês</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {planos.map((plano) => {
                const assinantes = assinantesPorPlano[plano.id] ?? 0;
                return (
                  <TableRow key={plano.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{plano.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {plano.servicoNome || (
                            <span className="text-destructive">serviço desativado</span>
                          )}
                          {plano.permite_acumular && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5">
                              <RotateCcw size={10} /> acumula sobra
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{plano.creditos_mes}</TableCell>
                    <TableCell>{formatCentavos(plano.preco_centavos)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2.5"
                        onClick={() => setAssinantesPlanoId(plano.id)}
                      >
                        <Users size={14} /> {assinantes} pet{assinantes === 1 ? "" : "s"}
                      </Button>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatCentavos(receitaPorPlano[plano.id] ?? assinantes * plano.preco_centavos)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${plano.nome}`}
                          title="Editar plano"
                          onClick={() => setFormTarget(plano.id)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Desativar ${plano.nome}`}
                          title="Desativar plano"
                          onClick={() => setDeletingId(plano.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {planos.length > 0 && <Pagination page={page} totalPages={totalPages} />}

      <PlanoSheet
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        plano={editingPlano}
        servicos={servicos}
      />

      {assinantesPlano && (
        <AssinantesSheet
          open={!!assinantesPlano}
          onOpenChange={(open) => !open && setAssinantesPlanoId(null)}
          planoId={assinantesPlano.id}
          planoNome={assinantesPlano.nome}
          creditosMes={assinantesPlano.creditos_mes}
        />
      )}

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title={`Desativar ${deletingPlano?.nome ?? "plano"}?`}
        description="O plano some das listas e não pode mais ser ativado para novos pets. Quem já tem o plano continua com ele normalmente."
        confirmLabel="Desativar"
        pendingLabel="Desativando..."
        onConfirm={handleDelete}
        pending={isPending}
      />
    </div>
  );
}
