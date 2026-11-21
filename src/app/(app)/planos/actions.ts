"use server";

import { semPermissao } from "@/lib/acesso";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { parseCentavos } from "@/lib/currency";

type ActionResult = { error: string } | { success: true };

type ItemPlano = { servico_id: string; quantidade: number };

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
      itens: ItemPlano[];
    };

const planoFields = z.object({
  nome: z.string().trim().min(2, "Nome muito curto"),
  preco: z.string().trim().min(1, "Preço é obrigatório"),
});

const itensSchema = z
  .array(
    z.object({
      servico_id: z.string().trim().min(1, "Escolha o serviço de cada linha"),
      quantidade: z.coerce.number().int("Quantidade inválida").min(1, "Quantidade mínima é 1").max(100, "Máximo de 100 por mês"),
    })
  )
  .min(1, "Inclua pelo menos um serviço no plano");

function readPlanoForm(formData: FormData): PlanoFormResult {
  const parsed = planoFields.safeParse({
    nome: formData.get("nome"),
    preco: formData.get("preco"),
  });
  if (!parsed.success) {
    const message: string = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return { error: message };
  }

  let bruto: unknown = [];
  try {
    bruto = JSON.parse(String(formData.get("itens") ?? "[]"));
  } catch {
    return { error: "Serviços do plano inválidos" };
  }
  const itens = itensSchema.safeParse(bruto);
  if (!itens.success) return { error: itens.error.issues[0]?.message ?? "Serviços do plano inválidos" };
  const ids = itens.data.map((i) => i.servico_id);
  if (new Set(ids).size !== ids.length) return { error: "Cada serviço só pode aparecer uma vez no plano." };

  const centavos = parseCentavos(parsed.data.preco);
  if (centavos === null || centavos <= 0) {
    return { error: "Preço inválido" };
  }

  return {
    data: {
      nome: parsed.data.nome,
      // Resumo: o primeiro serviço é o principal e o total de créditos.
      creditos_mes: itens.data.reduce((s, i) => s + i.quantidade, 0),
      servico_id: itens.data[0].servico_id,
      preco_centavos: centavos,
      permite_acumular: formData.get("permite_acumular") === "on",
    },
    itens: itens.data,
  };
}

/** Deixa os serviços do plano iguais aos do formulário. */
async function sincronizarItens(
  supabase: Awaited<ReturnType<typeof createClient>>,
  petshopId: string,
  planoId: string,
  itens: ItemPlano[]
): Promise<string | null> {
  const { error: delError } = await supabase
    .from("plano_itens")
    .delete()
    .eq("plano_id", planoId)
    .not("servico_id", "in", `(${itens.map((i) => i.servico_id).join(",")})`);
  if (delError) return mensagemErroBanco(delError);
  const { error } = await supabase.from("plano_itens").upsert(
    itens.map((i) => ({ petshop_id: petshopId, plano_id: planoId, servico_id: i.servico_id, quantidade: i.quantidade })),
    { onConflict: "plano_id,servico_id" }
  );
  if (error) return mensagemErroBanco(error);
  // Serviço novo no plano: quem já assina ganha o crédito deste mês na hora.
  const { error: erroCreditos } = await supabase.rpc("renovar_creditos_plano", { p_plano_id: planoId });
  return erroCreditos ? mensagemErroBanco(erroCreditos) : null;
}

export async function createPlano(formData: FormData): Promise<ActionResult> {
  const bloqueio = await semPermissao("planos");
  if (bloqueio) return bloqueio;
  const parsed = readPlanoForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { data: criado, error } = await supabase
    .from("planos")
    .insert({ ...parsed.data, petshop_id: petshopId })
    .select("id")
    .single();
  if (error || !criado) return { error: mensagemErroBanco(error) };
  const erroItens = await sincronizarItens(supabase, petshopId, criado.id, parsed.itens);
  if (erroItens) return { error: erroItens };

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
  const petshopId = await getCurrentPetshopId(supabase);
  const { error } = await supabase.from("planos").update(parsed.data).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };
  const erroItens = await sincronizarItens(supabase, petshopId, id, parsed.itens);
  if (erroItens) return { error: erroItens };

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
