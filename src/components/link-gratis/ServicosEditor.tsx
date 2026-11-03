"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { MAX_SERVICOS, type ServicoGratis } from "@/lib/link-gratis/comum";
import { cn } from "@/lib/utils";

type Linha = { id: number; nome: string; preco: string };

function precoParaTexto(centavos: number | null): string {
  if (centavos == null) return "";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Lista editável de serviços. Vai pro form como pares servico_nome /
 * servico_preco (inputs com o mesmo name, na ordem).
 */
export function ServicosEditor({
  inicial,
  className,
}: {
  inicial: ServicoGratis[];
  className?: string;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial.map((s, i) => ({ id: i, nome: s.nome, preco: precoParaTexto(s.preco_centavos) }))
  );
  const [proximoId, setProximoId] = useState(inicial.length);

  function adicionar() {
    if (linhas.length >= MAX_SERVICOS) return;
    setLinhas((l) => [...l, { id: proximoId, nome: "", preco: "" }]);
    setProximoId((n) => n + 1);
  }

  function mudar(id: number, campo: "nome" | "preco", valor: string) {
    setLinhas((l) => l.map((x) => (x.id === id ? { ...x, [campo]: valor } : x)));
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-[1fr_7.5rem_2rem] gap-2 px-1 text-xs font-semibold text-muted-foreground">
        <span>Serviço</span>
        <span>Preço (opcional)</span>
        <span />
      </div>
      {linhas.map((l) => (
        <div key={l.id} className="grid grid-cols-[1fr_7.5rem_2rem] items-center gap-2">
          <input
            name="servico_nome"
            value={l.nome}
            onChange={(e) => mudar(l.id, "nome", e.target.value)}
            maxLength={80}
            placeholder="Ex.: Banho"
            aria-label="Nome do serviço"
            className="h-10 w-full min-w-0 rounded-xl border border-input bg-white/90 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
              R$
            </span>
            <input
              name="servico_preco"
              value={l.preco}
              onChange={(e) => mudar(l.id, "preco", e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label={`Preço de ${l.nome || "serviço"}`}
              className="h-10 w-full min-w-0 rounded-xl border border-input bg-white/90 pr-2 pl-8 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <button
            type="button"
            onClick={() => setLinhas((x) => x.filter((y) => y.id !== l.id))}
            aria-label={`Remover ${l.nome || "serviço"}`}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {linhas.length < MAX_SERVICOS && (
        <button
          type="button"
          onClick={adicionar}
          className="mt-1 flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-primary hover:bg-secondary"
        >
          <Plus size={15} /> Adicionar serviço
        </button>
      )}
    </div>
  );
}
