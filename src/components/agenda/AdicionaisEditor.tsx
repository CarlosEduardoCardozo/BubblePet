"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { formatCentavos, parseCentavos } from "@/lib/currency";
import { SUGESTOES_ADICIONAIS, type Adicional } from "@/lib/adicionais";
import { cn } from "@/lib/utils";

export type LinhaAdicional = { chave: number; descricao: string; valor: string };

let proximaChave = 1;

export function linhasDeAdicionais(adicionais: Adicional[]): LinhaAdicional[] {
  return adicionais.map((a) => ({
    chave: proximaChave++,
    descricao: a.descricao,
    valor: formatCentavos(a.valorCentavos).replace("R$", "").trim(),
  }));
}

/** Converte as linhas do formulário; linha totalmente vazia é ignorada. */
export function adicionaisDasLinhas(
  linhas: LinhaAdicional[]
): { ok: true; adicionais: Adicional[] } | { ok: false; erro: string } {
  const adicionais: Adicional[] = [];
  for (const l of linhas) {
    const descricao = l.descricao.trim();
    if (!descricao && !l.valor.trim()) continue;
    if (!descricao) return { ok: false, erro: "Descreva cada adicional (ex.: Desembolo)." };
    const valorCentavos = l.valor.trim() ? parseCentavos(l.valor) : 0;
    if (valorCentavos == null) return { ok: false, erro: `Valor inválido em “${descricao}”.` };
    adicionais.push({ descricao, valorCentavos });
  }
  return { ok: true, adicionais };
}

export function totalDasLinhas(linhas: LinhaAdicional[]): number {
  return linhas.reduce((s, l) => s + (parseCentavos(l.valor) ?? 0), 0);
}

/**
 * Extras cobrados no atendimento: desembolo, procedimento diferente, taxa de
 * busca... Sempre cobrados à parte, mesmo quando o banho é do plano.
 */
export function AdicionaisEditor({
  linhas,
  onChange,
  sugestoesExtras = [],
  disabled,
}: {
  linhas: LinhaAdicional[];
  onChange: (linhas: LinhaAdicional[]) => void;
  /** Nomes de serviços cadastrados, que também viram sugestão. */
  sugestoesExtras?: string[];
  disabled?: boolean;
}) {
  const usadas = new Set(linhas.map((l) => l.descricao.trim().toLowerCase()));
  const sugestoes = Array.from(new Set([...SUGESTOES_ADICIONAIS, ...sugestoesExtras])).filter(
    (s) => !usadas.has(s.toLowerCase())
  );

  function adicionar(descricao = "") {
    onChange([...linhas, { chave: proximaChave++, descricao, valor: "" }]);
  }

  function alterar(chave: number, campo: "descricao" | "valor", valor: string) {
    onChange(linhas.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

  return (
    <div className="flex flex-col gap-2">
      {linhas.map((l) => (
        <div key={l.chave} className="flex items-center gap-2">
          <Input
            value={l.descricao}
            onChange={(e) => alterar(l.chave, "descricao", e.target.value)}
            placeholder="Ex.: Desembolo"
            aria-label="Descrição do adicional"
            maxLength={80}
            disabled={disabled}
            className="min-w-0 flex-1"
            autoFocus={!l.descricao}
          />
          <div className="w-28 shrink-0">
            <CurrencyInput
              value={l.valor}
              onChange={(e) => alterar(l.chave, "valor", e.target.value)}
              aria-label={`Valor de ${l.descricao || "adicional"}`}
              disabled={disabled}
              autoFocus={!!l.descricao && !l.valor}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(linhas.filter((x) => x.chave !== l.chave))}
            disabled={disabled}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remover ${l.descricao || "adicional"}`}
          >
            <X size={16} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5">
        {sugestoes.slice(0, 8).map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => adicionar(s)}
            className="rounded-full border border-border bg-white px-2.5 py-1 text-xs text-foreground hover:border-primary hover:text-primary disabled:opacity-50"
          >
            + {s}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => adicionar()}
          className={cn(
            "flex items-center gap-1 rounded-full border border-dashed border-primary/60 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
          )}
        >
          <Plus size={12} /> Outro
        </button>
      </div>
    </div>
  );
}
