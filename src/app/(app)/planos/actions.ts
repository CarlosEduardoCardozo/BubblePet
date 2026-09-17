"use server";

import { semPermissao } from "@/lib/acesso";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { parseCentavos } from "@/lib/currency";

type ActionResult = { error: string } | { success: true };

type PlanoFormResult =
  | { error: string }
  | {
      data: {
        nome: string;
        creditos_mes: number;
        servico_id: string;
        preco_centavos: number;
        permite_acumular: boolean;
      };
    };

const planoFields = z.object({
  nome: z.string().trim().min(2, "Nome muito curto"),
  creditos_mes: z.string().trim().min(1, "Créditos por mês é obrigatório"),
  servico_id: z.string().trim().min(1, "Selecione o serviço"),
  preco: z.string().trim().min(1, "Preço é obrigatório"),
});

function readPlanoForm(formData: FormData): PlanoFormResult {
  const parsed = planoFields.safeParse({
    nome: formData.get("nome"),
    creditos_mes: formData.get("creditos_mes"),
    servico_id: formData.get("servico_id"),
    preco: formData.get("preco"),
  });

  if (!parsed.success) {
    const message: string = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return { error: message };
  }

  const creditos = Number(parsed.data.creditos_mes);
  if (!Number.isFinite(creditos) || creditos <= 0) {
    return { error: "Créditos por mês inválido" };
  }

  const centavos = parseCentavos(parsed.data.preco);
  if (centavos === null || centavos <= 0) {
    return { error: "Preço inválido" };
  }

  return {
    data: {
      nome: parsed.data.nome,
      creditos_mes: Math.round(creditos),
      servico_id: parsed.data.servico_id,
      preco_centavos: centavos,
      permite_acumular: formData.get("permite_acumular") === "on",
    },
  };
}

export async function createPlano(formData: FormData): Promise<ActionResult> {
  const bloqueio = await semPermissao("planos");
  if (bloqueio) return bloqueio;
  const parsed = readPlanoForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { error } = await supabase
    .from("planos")
    .insert({ ...parsed.data, petshop_id: petshopId });
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/planos");
  return { success: true };
}

export async function updatePlano(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const bloqueio = await semPermissao("planos");
  if (bloqueio) return bloqueio;
  const parsed = readPlanoForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("planos").update(parsed.data).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/planos");
  return { success: true };
}

export async function deletePlano(id: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("planos");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { error } = await supabase
    .from("planos")
    .update({ ativo: false })
    .eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/planos");
  return { success: true };
}
