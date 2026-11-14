"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CreditCard, Pencil, Plus, SearchX, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alternar } from "@/components/shared/Alternar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCentavos } from "@/lib/currency";
import {
  formatPercentual,
  labelTipoMetodo,
  resumoPrazo,
  type Caixa,
  type MetodoPagamento,
} from "@/lib/pagamentos";
import { MetodoDialog } from "./MetodoDialog";
import { deleteMetodo, setMetodoAtivo } from "./actions";

function resumoTaxas(m: MetodoPagamento): string {
  const pcts = m.taxas.map((t) => t.percentual);
  const partes: string[] = [];
  if (pcts.length > 0) {
    const min = Math.min(...pcts);
    const max = Math.max(...pcts);
    partes.push(min === max ? `${formatPercentual(min)}%` : `${formatPercentual(min)}% a ${formatPercentual(max)}%`);
  }
  if (m.taxa_fixa_tipo && m.taxa_fixa_valor !== null) {
    partes.push(
      m.taxa_fixa_tipo === "reais"
        ? `+ ${formatCentavos(Math.round(m.taxa_fixa_valor * 100))} por parcela`
        : `+ ${formatPercentual(m.taxa_fixa_valor)}% fixo`
    );
  }
  return partes.join(" ") || "Sem taxa";
}

export function MetodosCard({
  metodos,
  caixas,
  usaVariosCaixas,
}: {
  metodos: MetodoPagamento[];
  caixas: Caixa[];
  usaVariosCaixas: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [formTarget, setFormTarget] = useState<"new" | string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? metodos.filter((m) =>
        [m.descricao, labelTipoMetodo(m.tipo), m.bandeira ?? ""].some((t) => t.toLowerCase().includes(termo))
      )
    : metodos;

  const editando =
    typeof formTarget === "string" && formTarget !== "new"
      ? (metodos.find((m) => m.id === formTarget) ?? null)
      : null;
  const excluindo = metodos.find((m) => m.id === deletingId) ?? null;
  const nomeCaixa = (id: string | null) =>
    id ? (caixas.find((c) => c.id === id)?.nome ?? "—") : (caixas.find((c) => c.principal)?.nome ?? "Principal");

  function alternarAtivo(m: MetodoPagamento) {
    startTransition(async () => {
      const result = await setMetodoAtivo(m.id, !m.ativo);
      if ("error" in result) toast.error(result.error);
    });
  }

  function handleDelete() {
    if (!deletingId) return;
    const nome = excluindo?.descricao ?? "Método";
    startTransition(async () => {
      const result = await deleteMetodo(deletingId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(result.aviso ?? `${nome} excluído.`);
        setDeletingId(null);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-card glass p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold">Métodos de pagamento</h2>
          <p className="text-sm text-muted-foreground">
            Cadastre cada maquininha, conta ou forma de receber com as taxas e o prazo do seu contrato.
          </p>
        </div>
        <Button onClick={() => setFormTarget("new")}>
          <Plus size={16} /> Adicionar método de pagamento
        </Button>
      </div>

      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar método de pagamento..."
        aria-label="Buscar método de pagamento"
      />

      {metodos.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum método cadastrado"
          description="Adicione suas maquininhas e o Pix para registrar os recebimentos com a taxa certa."
          action={
            <Button onClick={() => setFormTarget("new")}>
              <Plus size={16} /> Adicionar o primeiro método
            </Button>
          }
        />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={SearchX} title={`Nenhum método encontrado para “${busca}”`} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-white/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Taxa</TableHead>
                <TableHead className="hidden md:table-cell">Recebe em</TableHead>
                {usaVariosCaixas && <TableHead className="hidden lg:table-cell">Caixa</TableHead>}
                <TableHead>Ativo</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <span className="flex flex-col">
                      <span className="flex items-center gap-2">
                        {m.descricao}
                        {m.sistema && <Badge variant="secondary">Padrão</Badge>}
                      </span>
                      {m.bandeira && <span className="text-xs font-normal text-muted-foreground">{m.bandeira}</span>}
                    </span>
                  </TableCell>
                  <TableCell>{labelTipoMetodo(m.tipo)}</TableCell>
                  <TableCell className="hidden md:table-cell">{resumoTaxas(m)}</TableCell>
                  <TableCell className="hidden md:table-cell">{resumoPrazo(m.prazo_modo, m.prazo_dias)}</TableCell>
                  {usaVariosCaixas && (
                    <TableCell className="hidden lg:table-cell">{nomeCaixa(m.caixa_id)}</TableCell>
                  )}
                  <TableCell>
                    <Alternar
                      ligado={m.ativo}
                      onChange={() => alternarAtivo(m)}
                      rotulo={`${m.ativo ? "Desativar" : "Ativar"} ${m.descricao}`}
                      disabled={isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${m.descricao}`}
                        title="Editar método"
                        onClick={() => setFormTarget(m.id)}
                      >
                        <Pencil size={16} />
                      </Button>
                      {!m.sistema && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir ${m.descricao}`}
                          title="Excluir método"
                          onClick={() => setDeletingId(m.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <MetodoDialog
        key={formTarget ?? "fechado"}
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        metodo={editando}
        caixas={caixas}
        usaVariosCaixas={usaVariosCaixas}
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title={`Excluir ${excluindo?.descricao ?? "método"}?`}
        description="Se esse método já tem lançamentos, ele só será desativado para o histórico não se perder."
        confirmLabel="Excluir"
        pendingLabel="Excluindo..."
        onConfirm={handleDelete}
        pending={isPending}
      />
    </section>
  );
}
