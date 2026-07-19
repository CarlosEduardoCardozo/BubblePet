"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { parseCentavos } from "@/lib/currency";

type ActionResult = { error: string } | { success: true };

type ServicoFormResult =
  | { error: string }
  | {
      data: {
        nome: string;
        duracao_min: number;
        preco_centavos: number;
      };
    };

const servicoFields = z.object({
  nome: z.string().trim().min(2, "Nome muito curto"),
  duracao_min: z.string().trim().min(1, "Duração é obrigatória"),
  preco: z.string().trim().min(1, "Preço é obrigatório"),
});

function readServicoForm(formData: FormData): ServicoFormResult {
  const parsed = servicoFields.safeParse({
    nome: formData.get("nome"),
    duracao_min: formData.get("duracao_min"),
    preco: formData.get("preco"),
  });

  if (!parsed.success) {
    const message: string = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return { error: message };
  }

  const duracao = Number(parsed.data.duracao_min);
  if (!Number.isFinite(duracao) || duracao <= 0) {
    return { error: "Duração inválida" };
  }

  const centavos = parseCentavos(parsed.data.preco);
  if (centavos === null || centavos <= 0) {
    return { error: "Preço inválido" };
  }

  return {
    data: {
      nome: parsed.data.nome,
      duracao_min: Math.round(duracao),
      preco_centavos: centavos,
    },
  };
}

export async function createServico(formData: FormData): Promise<ActionResult> {
  const parsed = readServicoForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { error } = await supabase
    .from("servicos")
    .insert({ ...parsed.data, petshop_id: petshopId });
  if (error) return { error: error.message };

  revalidatePath("/servicos");
  return { success: true };
}

export async function updateServico(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = readServicoForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("servicos").update(parsed.data).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/servicos");
  return { success: true };
}

export async function deleteServico(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("servicos")
    .update({ ativo: false })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/servicos");
  return { success: true };
}
