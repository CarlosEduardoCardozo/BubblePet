"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatCentavos } from "@/lib/currency";
import { ServicoSheet } from "./ServicoSheet";
import { deleteServico } from "./actions";

export type Servico = {
  id: string;
  nome: string;
  duracao_min: number;
  preco_centavos: number;
};

export function ServicosTable({
  servicos,
  page,
  totalPages,
}: {
  servicos: Servico[];
  page: number;
  totalPages: number;
}) {
  const [formTarget, setFormTarget] = useState<"new" | string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editingServico =
    typeof formTarget === "string"
      ? (servicos.find((s) => s.id === formTarget) ?? null)
      : null;
  const deletingServico = servicos.find((s) => s.id === deletingId) ?? null;

  function handleDelete() {
    if (!deletingId) return;
    const nome = deletingServico?.nome ?? "Serviço";
    startTransition(async () => {
      const result = await deleteServico(deletingId);
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
        <h1 className="text-2xl font-semibold">Serviços</h1>
        <Button onClick={() => setFormTarget("new")}>
          <Plus size={16} /> Novo serviço
        </Button>
      </div>

      <SearchInput placeholder="Buscar por nome..." />

      {servicos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">
            Nenhum serviço cadastrado ainda.
          </p>
          <Button onClick={() => setFormTarget("new")}>
            <Plus size={16} /> Cadastrar o primeiro serviço
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicos.map((servico) => (
                <TableRow key={servico.id}>
                  <TableCell className="font-medium">{servico.nome}</TableCell>
                  <TableCell>{servico.duracao_min} min</TableCell>
                  <TableCell>{formatCentavos(servico.preco_centavos)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${servico.nome}`}
                        onClick={() => setFormTarget(servico.id)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir ${servico.nome}`}
                        onClick={() => setDeletingId(servico.id)}
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

      <ServicoSheet
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        servico={editingServico}
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title={`Excluir ${deletingServico?.nome ?? "serviço"}?`}
        description="O serviço deixa de aparecer nas listagens. Essa ação não pode ser desfeita pela tela."
        onConfirm={handleDelete}
        pending={isPending}
      />
    </div>
  );
}
