"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { semPermissao } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { aceitaParcelas, diasDoPrazo, MAX_PARCELAS, type MetodoInput } from "@/lib/pagamentos";

type ActionResult = { error: string } | { success: true; aviso?: string };

const PATH = "/configuracoes/pagamentos";

// ---------------------------------------------------------------------------
// Caixas
// ---------------------------------------------------------------------------

const caixaSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(40, "Nome muito longo"),
  tipo: z.enum(["balcao", "banco", "maquininha"]),
});

export async function setUsaVariosCaixas(usaVarios: boolean): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  if (!usaVarios) {
    const { count } = await supabase
      .from("caixas")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true)
      .eq("principal", false);
    if ((count ?? 0) > 0) {
      return { error: "Desative os outros caixas antes de voltar para um caixa só." };
    }
  }

  const { error } = await supabase
    .from("petshops")
    .update({ usa_varios_caixas: usaVarios })
    .eq("id", petshopId);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath(PATH);
  return { success: true };
}

export async function createCaixa(input: { nome: string; tipo: string }): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;
  const parsed = caixaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { error } = await supabase.from("caixas").insert({ ...parsed.data, petshop_id: petshopId });
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath(PATH);
  return { success: true };
}

export async function updateCaixa(
  id: string,
  input: { nome: string; tipo: string }
): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;
  const parsed = caixaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.from("caixas").update(parsed.data).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath(PATH);
  return { success: true };
}

export async function setCaixaAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;

  const supabase = await createClient();
  const { data: caixa } = await supabase.from("caixas").select("principal").eq("id", id).maybeSingle();
  if (!caixa) return { error: "Caixa não encontrado." };
  if (caixa.principal && !ativo) return { error: "O caixa principal não pode ser desativado." };

  const { error } = await supabase.from("caixas").update({ ativo }).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath(PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Métodos de pagamento
// ---------------------------------------------------------------------------

const metodoSchema = z.object({
  descricao: z.string().trim().min(2, "Descrição muito curta").max(60, "Descrição muito longa"),
  tipo: z.enum(["dinheiro", "pix", "link_pagamento", "cartao_credito", "maquina_cartao", "boleto"]),
  bandeira: z.string().trim().max(40, "Bandeira muito longa").nullable(),
  caixa_id: z.uuid().nullable(),
  taxa_fixa_tipo: z.enum(["reais", "percentual"]).nullable(),
  taxa_fixa_valor: z.number().min(0, "Taxa inválida").max(100000, "Taxa inválida").nullable(),
  prazo_modo: z.enum(["d1", "d14", "d30", "personalizado"]),
  prazo_dias: z.number().int().min(0, "Prazo inválido").max(365, "Prazo máximo de 365 dias"),
  parcelado_modo: z.enum(["parcela_a_parcela", "tudo_junto"]),
  max_parcelas: z.number().int().min(1).max(MAX_PARCELAS),
  taxas: z.array(
    z.object({
      parcelas: z.number().int().min(1).max(MAX_PARCELAS),
      percentual: z.number().min(0, "Percentual inválido").max(100, "Percentual máximo de 100%"),
    })
  ),
});

type MetodoNormalizado =
  | { error: string }
  | {
      campos: Omit<MetodoInput, "taxas" | "bandeira"> & { bandeira: string | null };
      taxas: { parcelas: number; percentual: number }[];
    };

function normalizarMetodo(input: MetodoInput): MetodoNormalizado {
  const parsed = metodoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  if ((d.taxa_fixa_tipo === null) !== (d.taxa_fixa_valor === null)) {
    return { error: "Informe o valor da taxa fixa ou deixe os dois campos em branco." };
  }
  if (d.taxa_fixa_tipo === "percentual" && (d.taxa_fixa_valor ?? 0) > 100) {
    return { error: "A taxa fixa em % não pode passar de 100." };
  }

  const parcelavel = aceitaParcelas(d.tipo);
  const maxParcelas = parcelavel ? d.max_parcelas : 1;

  // Uma linha por parcela de 1 até o máximo; o que faltar vira 0%.
  const porParcela = new Map(d.taxas.map((t) => [t.parcelas, t.percentual]));
  const taxas = Array.from({ length: maxParcelas }, (_, i) => ({
    parcelas: i + 1,
    percentual: porParcela.get(i + 1) ?? 0,
  }));

  return {
    campos: {
      descricao: d.descricao,
      tipo: d.tipo,
      bandeira: d.bandeira || null,
      caixa_id: d.caixa_id,
      taxa_fixa_tipo: d.taxa_fixa_tipo,
      taxa_fixa_valor: d.taxa_fixa_valor,
      prazo_modo: d.prazo_modo,
      prazo_dias: diasDoPrazo(d.prazo_modo, d.prazo_dias),
      parcelado_modo: parcelavel ? d.parcelado_modo : "parcela_a_parcela",
      max_parcelas: maxParcelas,
    },
    taxas,
  };
}

export async function createMetodo(input: MetodoInput): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;
  const norm = normalizarMetodo(input);
  if ("error" in norm) return norm;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { data: criado, error } = await supabase
    .from("metodos_pagamento")
    .insert({ ...norm.campos, petshop_id: petshopId })
    .select("id")
    .single();
  if (error || !criado) return { error: mensagemErroBanco(error) };

  const { error: erroTaxas } = await supabase
    .from("metodo_taxas_parcela")
    .insert(norm.taxas.map((t) => ({ ...t, metodo_id: criado.id, petshop_id: petshopId })));
  if (erroTaxas) {
    // Sem as taxas o método ficaria pela metade: desfaz.
    await supabase.from("metodos_pagamento").delete().eq("id", criado.id);
    return { error: mensagemErroBanco(erroTaxas) };
  }

  revalidatePath(PATH);
  return { success: true };
}

export async function updateMetodo(id: string, input: MetodoInput): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;
  const norm = normalizarMetodo(input);
  if ("error" in norm) return norm;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { data: atual } = await supabase
    .from("metodos_pagamento")
    .select("sistema, tipo")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { error: "Método não encontrado." };
  // O método criado pelo sistema (Dinheiro) mantém o tipo.
  if (atual.sistema && norm.campos.tipo !== atual.tipo) {
    return { error: "O tipo desse método não pode ser alterado." };
  }

  const { error } = await supabase.from("metodos_pagamento").update(norm.campos).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  const { error: erroTaxas } = await supabase
    .from("metodo_taxas_parcela")
    .upsert(
      norm.taxas.map((t) => ({ ...t, metodo_id: id, petshop_id: petshopId })),
      { onConflict: "metodo_id,parcelas" }
    );
  if (erroTaxas) return { error: mensagemErroBanco(erroTaxas) };

  // Se o máximo de parcelas diminuiu, some o que passou do novo limite.
  await supabase
    .from("metodo_taxas_parcela")
    .delete()
    .eq("metodo_id", id)
    .gt("parcelas", norm.campos.max_parcelas);

  revalidatePath(PATH);
  return { success: true };
}

export async function setMetodoAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;

  const supabase = await createClient();
  const { error } = await supabase.from("metodos_pagamento").update({ ativo }).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath(PATH);
  return { success: true };
}

/** Exclui o método; se já tem lançamentos, só desativa pra não perder o histórico. */
export async function deleteMetodo(id: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;

  const supabase = await createClient();
  const { data: metodo } = await supabase
    .from("metodos_pagamento")
    .select("sistema")
    .eq("id", id)
    .maybeSingle();
  if (!metodo) return { error: "Método não encontrado." };
  if (metodo.sistema) return { error: "Esse método é padrão do sistema. Você pode desativá-lo." };

  const { count } = await supabase
    .from("lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("metodo_id", id);

  if ((count ?? 0) > 0) {
    const { error } = await supabase.from("metodos_pagamento").update({ ativo: false }).eq("id", id);
    if (error) return { error: mensagemErroBanco(error) };
    revalidatePath(PATH);
    return { success: true, aviso: "Já tem lançamentos com esse método, então ele foi desativado em vez de excluído." };
  }

  const { error } = await supabase.from("metodos_pagamento").delete().eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath(PATH);
  return { success: true };
}
