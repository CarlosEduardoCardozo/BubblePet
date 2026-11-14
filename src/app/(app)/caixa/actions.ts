"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { semPermissao } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { competenciaDaData, hojeISO } from "@/lib/lancamentos";
import { lancarEntrada, reabrirExtrato } from "@/lib/lancamentos-entrada";

type ActionResult = { error: string } | { success: true; aviso?: string };

const PATH = "/caixa";

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

const lancamentoSchema = z.object({
  tipo: z.enum(["entrada", "saida"]),
  valor_centavos: z.number().int().min(1, "Informe um valor maior que zero").max(100_000_000, "Valor muito alto"),
  descricao: z.string().trim().max(120, "Descrição muito longa").nullable(),
  categoria_id: z.uuid().nullable(),
  data: dataISO,
  metodo_id: z.uuid().nullable(),
  caixa_id: z.uuid().nullable(),
  parcelas: z.number().int().min(1).max(12),
  // Só despesa: já foi paga (true) ou fica como "a pagar" até a data (false).
  pago: z.boolean(),
});

export type LancamentoInput = z.input<typeof lancamentoSchema>;

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

export async function criarLancamento(input: LancamentoInput): Promise<ActionResult> {
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return bloqueio;
  const parsed = lancamentoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  // Caixa: o escolhido (modo vários) > o do método > o principal.
  let metodo: MetodoRow | null = null;
  if (d.metodo_id) {
    const { data } = await supabase
      .from("metodos_pagamento")
      .select(
        "id, ativo, caixa_id, max_parcelas, prazo_dias, parcelado_modo, taxa_fixa_tipo, taxa_fixa_valor, metodo_taxas_parcela(parcelas, percentual)"
      )
      .eq("id", d.metodo_id)
      .maybeSingle();
    metodo = (data as unknown as MetodoRow | null) ?? null;
    if (!metodo) return { error: "Método de pagamento não encontrado." };
    if (!metodo.ativo) return { error: "Esse método de pagamento está desativado." };
  }
  if (d.tipo === "entrada" && !metodo) return { error: "Escolha a forma de pagamento." };

  let caixaId = d.caixa_id ?? metodo?.caixa_id ?? null;
  if (!caixaId) {
    const { data: principal } = await supabase.from("caixas").select("id").eq("principal", true).maybeSingle();
    caixaId = principal?.id ?? null;
  }
  if (!caixaId) return { error: "Nenhum caixa encontrado. Configure em Pagamentos e caixas." };

  const base = {
    petshop_id: petshopId,
    tipo: d.tipo,
    descricao: d.descricao || null,
    metodo_id: d.metodo_id,
    caixa_id: caixaId,
    categoria_id: d.categoria_id,
    competencia: competenciaDaData(d.data),
    data_lancamento: d.data,
    origem: "manual" as const,
  };

  if (d.tipo === "saida") {
    const { error } = await supabase.from("lancamentos").insert({
      ...base,
      valor_bruto_centavos: d.valor_centavos,
      taxa_centavos: 0,
      status: d.pago ? "realizado" : "previsto",
      data_prevista: d.data,
      data_recebimento: d.pago ? d.data : null,
    });
    if (error) return { error: mensagemErroBanco(error) };
    revalidatePath(PATH);
    return { success: true };
  }

  if (!metodo) return { error: "Escolha a forma de pagamento." };

  const r = await lancarEntrada(supabase, {
    petshopId,
    valorCentavos: d.valor_centavos,
    metodoId: metodo.id,
    parcelas: d.parcelas,
    data: d.data,
    descricao: base.descricao,
    categoriaId: d.categoria_id,
    caixaId,
    origem: "manual",
  });
  if ("error" in r) return r;

  revalidatePath(PATH);
  return { success: true };
}

/** Marca como recebido/pago hoje, ou volta pra previsto. */
export async function marcarRealizado(id: string, realizado: boolean): Promise<ActionResult> {
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return bloqueio;

  const supabase = await createClient();
  const { error } = await supabase
    .from("lancamentos")
    .update(
      realizado
        ? { status: "realizado", data_recebimento: hojeISO() }
        : { status: "previsto", data_recebimento: null }
    )
    .eq("id", id)
    .neq("status", "cancelado");
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath(PATH);
  return { success: true };
}

/**
 * Cancela o lançamento; se for parcelado, cancela todas as parcelas juntas.
 * Se veio de um extrato pago no Financeiro, o extrato volta a ficar em aberto.
 */
export async function cancelarLancamento(id: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return bloqueio;

  const supabase = await createClient();
  const { data: lanc } = await supabase
    .from("lancamentos")
    .select("grupo_id, origem, fechamento_id")
    .eq("id", id)
    .maybeSingle();
  if (!lanc) return { error: "Lançamento não encontrado." };

  if (lanc.origem === "extrato" && lanc.fechamento_id) {
    const r = await reabrirExtrato(supabase, lanc.fechamento_id);
    if ("error" in r) return r;
    revalidatePath(PATH);
    revalidatePath("/financeiro");
    revalidatePath("/dashboard");
    return { success: true, aviso: "O extrato voltou a ficar em aberto no Financeiro." };
  }

  const alvo = lanc.grupo_id
    ? supabase.from("lancamentos").update({ status: "cancelado", data_recebimento: null }).eq("grupo_id", lanc.grupo_id)
    : supabase.from("lancamentos").update({ status: "cancelado", data_recebimento: null }).eq("id", id);
  const { error } = await alvo;
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath(PATH);
  return { success: true };
}
