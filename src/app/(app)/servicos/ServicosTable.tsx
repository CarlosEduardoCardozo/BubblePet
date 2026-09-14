"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Scissors, SearchX } from "lucide-react";
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
import { resumoPrecos, temPrecoPorPorte } from "@/lib/servico-preco";
import { ServicoSheet } from "./ServicoSheet";
import { deleteServico } from "./actions";

export type Servico = {
  id: string;
  nome: string;
  duracao_min: number;
  preco_centavos: number;
  preco_pequeno_centavos: number | null;
  preco_medio_centavos: number | null;
  preco_grande_centavos: number | null;
  planosQueUsam: number;
  atendimentosMes: number;
};

export function ServicosTable({
  servicos,
  busca,
  page,
  totalPages,
  total,
}: {
  servicos: Servico[];
  busca: string;
  page: number;
  totalPages: number;
  total: number;
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
        toast.success(`${nome} desativado.`);
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Serviços"
        description={
          total === 0
            ? "O que o petshop oferece: banho, tosa, hidratação..."
            : `${total} serviço${total === 1 ? "" : "s"} ativo${total === 1 ? "" : "s"}`
        }
        action={
          <Button onClick={() => setFormTarget("new")}>
            <Plus size={16} /> Novo serviço
          </Button>
        }
      />

      <SearchInput placeholder="Buscar serviço..." />

      {servicos.length === 0 ? (
        busca ? (
          <EmptyState
            icon={SearchX}
            title={`Nenhum serviço encontrado para “${busca}”`}
            action={
              <Button variant="outline" nativeButton={false} render={<Link href="/servicos" />}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Scissors}
            title="Nenhum serviço cadastrado ainda"
            description="Comece pelo mais comum, como Banho ou Banho e tosa. Os planos e a agenda usam esses serviços."
            action={
              <Button onClick={() => setFormTarget("new")}>
                <Plus size={16} /> Cadastrar o primeiro serviço
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead className="hidden md:table-cell">Planos que usam</TableHead>
                <TableHead className="hidden lg:table-cell">Atendimentos no mês</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicos.map((servico) => (
                <TableRow key={servico.id}>
                  <TableCell className="font-medium">{servico.nome}</TableCell>
                  <TableCell>{servico.duracao_min} min</TableCell>
                  <TableCell>
                    {temPrecoPorPorte(servico) ? (
                      <span className="flex flex-col text-sm">
                        <span>{resumoPrecos(servico)}</span>
                        <span className="text-xs text-muted-foreground">
                          sem porte: {formatCentavos(servico.preco_centavos)}
                        </span>
                      </span>
                    ) : (
                      formatCentavos(servico.preco_centavos)
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {servico.planosQueUsam === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      `${servico.planosQueUsam} plano${servico.planosQueUsam === 1 ? "" : "s"}`
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{servico.atendimentosMes}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${servico.nome}`}
                        title="Editar serviço"
                        onClick={() => setFormTarget(servico.id)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Desativar ${servico.nome}`}
                        title="Desativar serviço"
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

      {servicos.length > 0 && <Pagination page={page} totalPages={totalPages} />}

      <ServicoSheet
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        servico={editingServico}
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title={`Desativar ${deletingServico?.nome ?? "serviço"}?`}
        description={
          deletingServico && deletingServico.planosQueUsam > 0
            ? `Esse serviço é coberto por ${deletingServico.planosQueUsam} plano${deletingServico.planosQueUsam === 1 ? "" : "s"}. Ao desativar, esses planos deixam de funcionar para novos agendamentos.`
            : "O serviço não poderá mais ser agendado nem incluído em planos. Os agendamentos já marcados continuam."
        }
        confirmLabel="Desativar"
        pendingLabel="Desativando..."
        onConfirm={handleDelete}
        pending={isPending}
      />
    </div>
  );
}
