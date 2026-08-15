"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  page,
  totalPages,
  servicos,
  assinantesPorPlano,
}: {
  planos: Plano[];
  page: number;
  totalPages: number;
  servicos: ServicoOption[];
  assinantesPorPlano: Record<string, number>;
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
        toast.success(`${nome} removido.`);
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Planos</h1>
        <Button onClick={() => setFormTarget("new")}>
          <Plus size={16} /> Novo plano
        </Button>
      </div>

      <SearchInput placeholder="Buscar por nome..." />

      {planos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">Nenhum plano cadastrado ainda.</p>
          <Button onClick={() => setFormTarget("new")}>
            <Plus size={16} /> Cadastrar o primeiro plano
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Créditos/mês</TableHead>
                <TableHead>Mensalidade</TableHead>
                <TableHead>Acumula</TableHead>
                <TableHead>Assinantes</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {planos.map((plano) => (
                <TableRow key={plano.id}>
                  <TableCell className="font-medium">{plano.nome}</TableCell>
                  <TableCell>{plano.servicoNome}</TableCell>
                  <TableCell>{plano.creditos_mes}</TableCell>
                  <TableCell>{formatCentavos(plano.preco_centavos)}</TableCell>
                  <TableCell>
                    {plano.permite_acumular ? (
                      <Badge>Sim</Badge>
                    ) : (
                      <span className="text-muted-foreground">Não</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssinantesPlanoId(plano.id)}
                    >
                      <Users size={14} /> {assinantesPorPlano[plano.id] ?? 0}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${plano.nome}`}
                        onClick={() => setFormTarget(plano.id)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir ${plano.nome}`}
                        onClick={() => setDeletingId(plano.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} />

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
        />
      )}

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title={`Excluir ${deletingPlano?.nome ?? "plano"}?`}
        description="O plano deixa de aparecer nas listagens e não pode mais ser assinado. Assinaturas existentes não são afetadas. Essa ação não pode ser desfeita pela tela."
        onConfirm={handleDelete}
        pending={isPending}
      />
    </div>
  );
}
