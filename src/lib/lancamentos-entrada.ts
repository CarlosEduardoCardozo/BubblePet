import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mensagemErroBanco } from "@/lib/db-errors";
import { calcularEntrada, competenciaDaData, hojeISO, type MetodoParaCalculo } from "@/lib/lancamentos";

// Lança um recebimento no caixa: aplica taxa e prazo do método, divide em
// parcelas e marca como recebido o que já caiu. Usado pelo Caixa (entrada
// manual) e pelo Financeiro (extrato marcado como pago).

type MetodoRow = {
  id: string;
  ativo: boolean;
  caixa_id: string | null;
  max_parcelas: number;
  prazo_dias: number;
  parcelado_modo: "parcela_a_parcela" | "tudo_junto";
  taxa_fixa_tipo: "reais" | "percentual" | null;
  taxa_fixa_valor: number | string | null;
  metodo_taxas_parcela: { parcelas: number; percentual: number | string }[] | null;
};

export type EntradaInput = {
  petshopId: string;
  valorCentavos: number;
  metodoId: string;
  parcelas: number;
  /** Data da venda/pagamento (yyyy-MM-dd). */
  data: string;
  descricao: string | null;
  categoriaId: string | null;
  /** Caixa escolhido na mão; nulo = o do método, senão o principal. */
  caixaId: string | null;
  origem: "manual" | "extrato" | "agendamento";
  fechamentoId?: string | null;
  agendamentoId?: string | null;
};

export async function lancarEntrada(
  supabase: SupabaseClient,
  e: EntradaInput
): Promise<{ error: string } | { success: true }> {
  const { data } = await supabase
    .from("metodos_pagamento")
    .select(
      "id, ativo, caixa_id, max_parcelas, prazo_dias, parcelado_modo, taxa_fixa_tipo, taxa_fixa_valor, metodo_taxas_parcela(parcelas, percentual)"
    )
    .eq("id", e.metodoId)
    .maybeSingle();
  const metodo = (data as unknown as MetodoRow | null) ?? null;
  if (!metodo) return { error: "Método de pagamento não encontrado." };
  if (!metodo.ativo) return { error: "Esse método de pagamento está desativado." };
  if (e.parcelas > metodo.max_parcelas) return { error: `Esse método aceita até ${metodo.max_parcelas}x.` };

  let caixaId = e.caixaId ?? metodo.caixa_id;
  if (!caixaId) {
    const { data: principal } = await supabase.from("caixas").select("id").eq("principal", true).maybeSingle();
    caixaId = principal?.id ?? null;
  }
  if (!caixaId) return { error: "Nenhum caixa encontrado. Configure em Pagamentos e caixas." };

  const paraCalculo: MetodoParaCalculo = {
    prazo_dias: metodo.prazo_dias,
    parcelado_modo: metodo.parcelado_modo,
    taxa_fixa_tipo: metodo.taxa_fixa_tipo,
    taxa_fixa_valor: metodo.taxa_fixa_valor === null ? null : Number(metodo.taxa_fixa_valor),
    taxas: (metodo.metodo_taxas_parcela ?? []).map((t) => ({
      parcelas: t.parcelas,
      percentual: Number(t.percentual),
    })),
  };
  const linhas = calcularEntrada(e.valorCentavos, e.parcelas, paraCalculo, e.data);
  const grupoId = linhas.length > 1 ? crypto.randomUUID() : null;
  const hoje = hojeISO();

  const { error } = await supabase.from("lancamentos").insert(
    linhas.map((l) => {
      // Já passou a data em que o dinheiro cai: entra como recebido.
      const recebido = l.data_prevista <= hoje;
      return {
        petshop_id: e.petshopId,
        tipo: "entrada",
        descricao: e.descricao,
        metodo_id: metodo.id,
        caixa_id: caixaId,
        categoria_id: e.categoriaId,
        competencia: competenciaDaData(e.data),
        data_lancamento: e.data,
        origem: e.origem,
        fechamento_id: e.fechamentoId ?? null,
        agendamento_id: e.agendamentoId ?? null,
        ...l,
        grupo_id: grupoId,
        status: recebido ? "realizado" : "previsto",
        data_recebimento: recebido ? l.data_prevista : null,
      };
    })
  );
  if (error) return { error: mensagemErroBanco(error) };
  return { success: true };
}

/** Tira do caixa o que entrou por causa do extrato (todas as parcelas). */
export async function apagarEntradaDoExtrato(
  supabase: SupabaseClient,
  fechamentoId: string
): Promise<{ error: string } | { success: true }> {
  const { error } = await supabase
    .from("lancamentos")
    .delete()
    .eq("fechamento_id", fechamentoId)
    .eq("origem", "extrato");
  if (error) return { error: mensagemErroBanco(error) };
  return { success: true };
}

/** Extrato volta a "em aberto" e a entrada dele sai do caixa. */
export async function reabrirExtrato(
  supabase: SupabaseClient,
  fechamentoId: string
): Promise<{ error: string } | { success: true }> {
  const { error } = await supabase
    .from("fechamentos")
    .update({ status: "aberto", pago_em: null })
    .eq("id", fechamentoId);
  if (error) return { error: mensagemErroBanco(error) };
  return apagarEntradaDoExtrato(supabase, fechamentoId);
}
