"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";

type ActionResult = { error: string } | { success: true };

// Assinar já concede o crédito do mês corrente — sem isso o tutor teria que
// esperar até o dia 1 do mês seguinte pra usar um plano que acabou de contratar.
export async function assinarPlano(
  petId: string,
  planoId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { data: plano, error: planoError } = await supabase
    .from("planos")
    .select("creditos_mes")
    .eq("id", planoId)
    .single();
  if (planoError || !plano) return { error: "Plano não encontrado." };

  const { data: assinatura, error: assinaturaError } = await supabase
    .from("assinaturas")
    .insert({ petshop_id: petshopId, pet_id: petId, plano_id: planoId })
    .select("id")
    .single();
  if (assinaturaError || !assinatura) {
    return { error: assinaturaError?.message ?? "Erro ao assinar o plano." };
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
  if (movimentoError) return { error: movimentoError.message };

  revalidatePath("/tutores-pets");
  revalidatePath("/planos");
  return { success: true };
}

export async function cancelarAssinatura(
  assinaturaId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("assinaturas")
    .update({ status: "cancelada" })
    .eq("id", assinaturaId);
  if (error) return { error: error.message };

  revalidatePath("/tutores-pets");
  revalidatePath("/planos");
  return { success: true };
}
