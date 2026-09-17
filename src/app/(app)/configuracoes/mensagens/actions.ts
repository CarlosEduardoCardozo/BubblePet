"use server";

import { semPermissao } from "@/lib/acesso";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { MODELOS, TIPOS_MODELO, validarModelo, type TipoModelo } from "@/lib/mensagens/modelos";

type ActionResult = { error: string } | { success: true };

/** Grava o texto de um tipo; `null` volta pro padrão do BubblePet. */
export async function salvarModelo(tipo: TipoModelo, texto: string | null): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;
  if (!TIPOS_MODELO.includes(tipo)) return { error: "Mensagem inválida." };
  const limpo = texto?.replace(/\r\n/g, "\n").trim() ?? null;
  if (limpo) {
    const erro = validarModelo(tipo, limpo);
    if (erro) return { error: erro };
  }

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data: petshop, error: erroLer } = await supabase
    .from("petshops")
    .select("modelos_mensagem")
    .eq("id", petshopId)
    .single();
  if (erroLer || !petshop) return { error: mensagemErroBanco(erroLer) };

  const atuais = { ...((petshop.modelos_mensagem as Record<string, string>) ?? {}) };
  if (!limpo || limpo === MODELOS[tipo].padrao) delete atuais[tipo];
  else atuais[tipo] = limpo;

  const { error } = await supabase.from("petshops").update({ modelos_mensagem: atuais }).eq("id", petshopId);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/configuracoes/mensagens");
  return { success: true };
}
