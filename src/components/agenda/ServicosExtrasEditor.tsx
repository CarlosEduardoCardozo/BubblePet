"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { Plus, X } from "lucide-react";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormSelect } from "@/components/shared/FormSelect";
import { createClient } from "@/lib/supabase/client";
import { formatCentavos, parseCentavos } from "@/lib/currency";
import { precoParaPorte } from "@/lib/servico-preco";
import { ZONE } from "@/lib/agenda/slots";
import type { ServicoExtra, ServicoExtraPedido } from "@/lib/servicos-extras";
import type { ServicoOption } from "./AgendaView";

/** Crédito do plano do pet por serviço, no mês da data escolhida. */
export type CreditoServico = { saldo: number; quantidade: number; planoNome: string };
export type CreditosDoPet = Map<string, CreditoServico>;

/**
 * Créditos do pet no mês de `dataISO`, um por serviço do plano.
 * undefined = carregando ou sem pet; mapa vazio = pet sem plano.
 */
export function useCreditosDoPet(petId: string, dataISO: string): CreditosDoPet | undefined {
  const [creditos, setCreditos] = useState<{ chave: string; mapa: CreditosDoPet } | null>(null);
  const competencia = dataISO
    ? DateTime.fromISO(dataISO, { zone: ZONE }).startOf("month").toISODate()
    : DateTime.now().setZone(ZONE).startOf("month").toISODate();
  const chave = `${petId}|${competencia}`;

  useEffect(() => {
    if (!petId) return;
    let cancelado = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("creditos_do_pet", { p_pet_id: petId, p_competencia: competencia });
      if (cancelado) return;
      const mapa: CreditosDoPet = new Map();
      for (const l of (data ?? []) as { servico_id: string; plano_nome: string; quantidade: number; saldo: number }[]) {
        mapa.set(l.servico_id, { saldo: l.saldo, quantidade: l.quantidade, planoNome: l.plano_nome });
      }
      setCreditos({ chave, mapa });
    })();
    return () => {
      cancelado = true;
    };
  }, [petId, competencia, chave]);

  if (!petId || !creditos || creditos.chave !== chave) return undefined;
  return creditos.mapa;
}

/** "Plano: 3 de 4" pro hint do serviço na lista. */
export function rotuloCredito(c: CreditoServico | undefined): string {
  if (!c) return "";
  return c.saldo > 0 ? ` · Plano: ${c.saldo} de ${c.quantidade}` : " · Plano: sem crédito no mês";
}

export type LinhaServicoExtra = {
  chave: number;
  servicoId: string;
  valor: string;
  usarPlano: boolean;
  /** Já usava crédito do plano quando o agendamento foi aberto (edição). */
  jaCoberto?: boolean;
};

let proximaChave = 1;

export function linhasDeServicosExtras(extras: ServicoExtra[]): LinhaServicoExtra[] {
  return extras.map((e) => ({
    chave: proximaChave++,
    servicoId: e.servicoId,
    valor: e.assinaturaId ? "" : formatCentavos(e.valorCentavos).replace("R$", "").trim(),
    usarPlano: !!e.assinaturaId,
    jaCoberto: !!e.assinaturaId,
  }));
}

/** A linha vai usar crédito: pediu e (já usava ou tem saldo). */
export function linhaCoberta(l: LinhaServicoExtra, creditos: CreditosDoPet | undefined): boolean {
  if (!l.usarPlano) return false;
  if (l.jaCoberto) return true;
  return (creditos?.get(l.servicoId)?.saldo ?? 0) > 0;
}

export function pedidosDasLinhas(
  linhas: LinhaServicoExtra[],
  creditos: CreditosDoPet | undefined
): { ok: true; pedidos: ServicoExtraPedido[] } | { ok: false; erro: string } {
  const pedidos: ServicoExtraPedido[] = [];
  for (const l of linhas) {
    if (!l.servicoId) return { ok: false, erro: "Escolha o serviço de cada linha (ou tire a linha vazia)." };
    const coberta = linhaCoberta(l, creditos);
    let valorCentavos: number | null = null;
    if (!coberta && l.valor.trim()) {
      valorCentavos = parseCentavos(l.valor);
      if (valorCentavos == null) return { ok: false, erro: "Valor inválido num dos serviços." };
    }
    pedidos.push({ servicoId: l.servicoId, valorCentavos, usarPlano: coberta });
  }
  return { ok: true, pedidos };
}

export function valorDaLinha(
  l: LinhaServicoExtra,
  servicos: ServicoOption[],
  porte: string | null,
  creditos: CreditosDoPet | undefined
): number {
  if (linhaCoberta(l, creditos)) return 0;
  const digitado = l.valor.trim() ? parseCentavos(l.valor) : null;
  if (digitado != null) return digitado;
  const s = servicos.find((x) => x.id === l.servicoId);
  return s ? precoParaPorte(s, porte) : 0;
}

export function duracaoDasLinhas(linhas: LinhaServicoExtra[], servicos: ServicoOption[]): number {
  return linhas.reduce((soma, l) => soma + (servicos.find((s) => s.id === l.servicoId)?.duracao_min ?? 0), 0);
}

/**
 * Outros serviços no mesmo agendamento (ex.: Banho + Hidratação). Cada um
 * soma tempo e valor; se o plano do pet tem crédito daquele serviço, dá pra
 * usar o crédito e ele sai sem custo.
 */
export function ServicosExtrasEditor({
  linhas,
  onChange,
  servicos,
  servicoPrincipalId,
  porte,
  creditos,
  disabled,
}: {
  linhas: LinhaServicoExtra[];
  onChange: (linhas: LinhaServicoExtra[]) => void;
  servicos: ServicoOption[];
  servicoPrincipalId: string;
  porte: string | null;
  creditos: CreditosDoPet | undefined;
  disabled?: boolean;
}) {
  function alterar(chave: number, mudanca: Partial<LinhaServicoExtra>) {
    onChange(linhas.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  }
  const disponiveis = servicos.filter((s) => s.id !== servicoPrincipalId && !linhas.some((l) => l.servicoId === s.id));

  return (
    <div className="flex flex-col gap-2">
      {linhas.map((l) => {
        const credito = creditos?.get(l.servicoId);
        const temCredito = l.jaCoberto || (credito?.saldo ?? 0) > 0;
        const coberta = linhaCoberta(l, creditos);
        const s = servicos.find((x) => x.id === l.servicoId);
        return (
          <div key={l.chave} className="flex flex-col gap-1.5 rounded-xl border border-border p-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <FormSelect
                  id={`extra-servico-${l.chave}`}
                  value={l.servicoId}
                  onValueChange={(servicoId) =>
                    alterar(l.chave, {
                      servicoId,
                      valor: "",
                      usarPlano: (creditos?.get(servicoId)?.saldo ?? 0) > 0,
                      jaCoberto: false,
                    })
                  }
                  placeholder="Serviço"
                  disabled={disabled}
                  options={servicos
                    .filter((x) => x.id === l.servicoId || disponiveis.some((d) => d.id === x.id))
                    .map((x) => ({
                      value: x.id,
                      label: x.nome,
                      hint: `${x.duracao_min} min · ${formatCentavos(precoParaPorte(x, porte))}${rotuloCredito(creditos?.get(x.id))}`,
                    }))}
                />
              </div>
              <div className="w-28 shrink-0">
                {coberta ? (
                  <span className="flex h-9 items-center justify-end px-2 text-sm font-medium text-primary">Plano</span>
                ) : (
                  <CurrencyInput
                    value={l.valor}
                    placeholder={s ? formatCentavos(precoParaPorte(s, porte)).replace("R$", "").trim() : "0,00"}
                    onChange={(e) => alterar(l.chave, { valor: e.target.value })}
                    aria-label={`Valor de ${s?.nome ?? "serviço"}`}
                    disabled={disabled || !l.servicoId}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => onChange(linhas.filter((x) => x.chave !== l.chave))}
                disabled={disabled}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Tirar ${s?.nome ?? "serviço"}`}
              >
                <X size={16} />
              </button>
            </div>
            {l.servicoId && temCredito && (
              <label className="flex items-center gap-2 px-1 text-xs">
                <input
                  type="checkbox"
                  checked={l.usarPlano}
                  disabled={disabled}
                  onChange={(e) => alterar(l.chave, { usarPlano: e.target.checked })}
                  className="size-3.5 accent-primary"
                />
                <span>
                  Usar crédito do <span className="font-medium text-primary">{credito?.planoNome ?? "plano"}</span>
                  {credito ? ` (${credito.saldo} de ${credito.quantidade} restantes)` : ""}
                </span>
              </label>
            )}
            {l.servicoId && !temCredito && credito && (
              <span className="px-1 text-xs text-muted-foreground">
                {credito.planoNome}: créditos de {s?.nome ?? "serviço"} esgotados no mês — entra como avulso.
              </span>
            )}
          </div>
        );
      })}
      {disponiveis.length > 0 && (
        <button
          type="button"
          disabled={disabled || !servicoPrincipalId}
          onClick={() => onChange([...linhas, { chave: proximaChave++, servicoId: "", valor: "", usarPlano: false }])}
          className="flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline disabled:opacity-50"
        >
          <Plus size={12} /> Adicionar outro serviço
        </button>
      )}
    </div>
  );
}
