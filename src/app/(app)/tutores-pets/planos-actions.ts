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

  const { data: jaAdicional } = await supabase
    .from("assinatura_pets_adicionais")
    .select("id, assinaturas!inner(status)")
    .eq("pet_id", petId)
    .eq("assinaturas.status", "ativa")
    .limit(1);
  if ((jaAdicional ?? []).length > 0) {
    return { error: "Este pet já está incluído no plano de outro pet. Tire ele de lá antes." };
  }

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

/**
 * Inclui outro pet do mesmo tutor na assinatura: os banhos do plano passam a
 * ser divididos entre os pets, e o adicional paga `precoCentavos` a mais.
 */
export async function adicionarPetAoPlano(
  assinaturaId: string,
  petId: string,
  precoCentavos: number
): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  if (precoCentavos == null || !precoValido(precoCentavos)) {
    return { error: "Informe o valor do pet adicional." };
  }
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const [{ data: assinatura }, { data: pet }] = await Promise.all([
    supabase
      .from("assinaturas")
      .select("id, status, pet_id, pets(tutor_id)")
      .eq("id", assinaturaId)
      .maybeSingle(),
    supabase.from("pets").select("id, nome, tutor_id").eq("id", petId).maybeSingle(),
  ]);
  if (!assinatura || assinatura.status !== "ativa") return { error: "Plano não encontrado." };
  if (!pet) return { error: "Pet não encontrado." };
  const titular = assinatura.pets as unknown as { tutor_id: string } | null;
  if (assinatura.pet_id === petId) return { error: `${pet.nome} já é o pet principal deste plano.` };
  if (titular?.tutor_id !== pet.tutor_id) {
    return { error: "Só dá pra incluir pets do mesmo cliente." };
  }

  // Um pet fica em um plano só: nem titular de outro, nem adicional de outro.
  const [{ count: proprios }, { data: outrosAdicionais }] = await Promise.all([
    supabase
      .from("assinaturas")
      .select("id", { count: "exact", head: true })
      .eq("pet_id", petId)
      .eq("status", "ativa"),
    supabase
      .from("assinatura_pets_adicionais")
      .select("id, assinaturas!inner(status)")
      .eq("pet_id", petId)
      .eq("assinaturas.status", "ativa"),
  ]);
  if ((proprios ?? 0) > 0) {
    return { error: `${pet.nome} já tem um plano próprio. Cancele o plano dele antes de incluir aqui.` };
  }
  if ((outrosAdicionais ?? []).length > 0) {
    return { error: `${pet.nome} já está incluído em outro plano.` };
  }

  const { error } = await supabase.from("assinatura_pets_adicionais").insert({
    petshop_id: petshopId,
    assinatura_id: assinaturaId,
    pet_id: petId,
    preco_centavos: precoCentavos,
  });
  if (error) return { error: mensagemErroBanco(error, { fallback: "Erro ao incluir o pet no plano." }) };

  revalidatePath("/tutores-pets");
  revalidatePath("/planos");
  revalidatePath("/financeiro");
  return { success: true };
}

/** Tira o pet adicional do plano. Os banhos que ele já usou continuam contados. */
export async function removerPetDoPlano(adicionalId: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { error } = await supabase.from("assinatura_pets_adicionais").delete().eq("id", adicionalId);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/tutores-pets");
  revalidatePath("/planos");
  revalidatePath("/financeiro");
  return { success: true };
}
