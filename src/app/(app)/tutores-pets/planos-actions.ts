"use server";

import { semPermissao } from "@/lib/acesso";
import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";

type ActionResult = { error: string } | { success: true };

// Assinar já concede o crédito do mês corrente — sem isso o tutor teria que
// esperar até o dia 1 do mês seguinte pra usar um plano que acabou de contratar.
function precoValido(preco: number | null | undefined): boolean {
  return preco == null || (Number.isInteger(preco) && preco >= 0 && preco <= 100_000_00);
}

/**
 * `precoCentavos` = valor mensal combinado pra este pet. Igual ao do plano
 * (ou vazio) grava null: se o preço do plano mudar, o pet acompanha.
 */
export async function assinarPlano(
  petId: string,
  planoId: string,
  precoCentavos?: number | null
): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  if (!precoValido(precoCentavos)) return { error: "Valor do plano inválido." };
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { data: plano, error: planoError } = await supabase
    .from("planos")
    .select("creditos_mes, preco_centavos")
    .eq("id", planoId)
    .single();
  if (planoError || !plano) return { error: "Plano não encontrado." };

  const precoPet =
    precoCentavos == null || precoCentavos === plano.preco_centavos ? null : precoCentavos;

  const { data: assinatura, error: assinaturaError } = await supabase
    .from("assinaturas")
    .insert({ petshop_id: petshopId, pet_id: petId, plano_id: planoId, preco_centavos: precoPet })
    .select("id")
    .single();
  if (assinaturaError || !assinatura) {
    return { error: mensagemErroBanco(assinaturaError, { fallback: "Erro ao ativar o plano." }) };
  }

  const competencia = DateTime.now()
    .setZone("America/Sao_Paulo")
    .startOf("month")
    .toISODate();

  const { error: movimentoError } = await supabase
    .from("creditos_movimentos")
    .insert({
      petshop_id: petshopId,
      assinatura_id: assinatura.id,
      tipo: "renovacao",
      quantidade: plano.creditos_mes,
      competencia,
    });
  if (movimentoError) return { error: mensagemErroBanco(movimentoError) };

  revalidatePath("/tutores-pets");
  revalidatePath("/planos");
  return { success: true };
}

/** Muda o valor mensal do plano só pra este pet (null = volta ao do plano). */
export async function atualizarPrecoAssinatura(
  assinaturaId: string,
  precoCentavos: number | null
): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  if (!precoValido(precoCentavos)) return { error: "Valor do plano inválido." };
  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("assinaturas")
    .select("id, planos(preco_centavos)")
    .eq("id", assinaturaId)
    .maybeSingle();
  if (!atual) return { error: "Plano do pet não encontrado." };
  const plano = atual.planos as unknown as { preco_centavos: number } | null;
  const precoPet = precoCentavos == null || precoCentavos === plano?.preco_centavos ? null : precoCentavos;

  const { error } = await supabase
    .from("assinaturas")
    .update({ preco_centavos: precoPet })
    .eq("id", assinaturaId);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/tutores-pets");
  revalidatePath("/planos");
  revalidatePath("/financeiro");
  return { success: true };
}

export async function cancelarAssinatura(
  assinaturaId: string
): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { error } = await supabase
    .from("assinaturas")
    .update({ status: "cancelada" })
    .eq("id", assinaturaId);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/tutores-pets");
  revalidatePath("/planos");
  return { success: true };
}
