"use server";

import { semPermissao } from "@/lib/acesso";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { z } from "zod";
import { MODELOS, TIPOS_MODELO, validarModelo, type TipoModelo } from "@/lib/mensagens/modelos";
import { lerLembretes, LIMITE_BOTAO, type AvisosConfig } from "@/lib/avisos";

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

const avisosSchema = z.object({
  confirmacao_ativa: z.boolean(),
  lembretes: z.array(z.object({ horas: z.number(), ativo: z.boolean() })),
  botao_confirmar: z.string().trim().min(1, "Escreva o texto do botão de confirmar.").max(LIMITE_BOTAO, `O botão aceita até ${LIMITE_BOTAO} letras.`),
  botao_cancelar: z.string().trim().min(1, "Escreva o texto do botão de cancelar.").max(LIMITE_BOTAO, `O botão aceita até ${LIMITE_BOTAO} letras.`),
  rodape: z.string().trim().max(120, "A linha embaixo dos botões aceita até 120 letras.").nullable(),
  janela_inicio: z.number().int().min(0).max(23),
  janela_fim: z.number().int().min(1).max(24),
});

/** Grava a ativação da confirmação, os horários dos lembretes, os botões e a janela de envio. */
export async function salvarAvisosConfig(config: AvisosConfig): Promise<ActionResult> {
  const bloqueio = await semPermissao("configuracoes");
  if (bloqueio) return bloqueio;
  const parsed = avisosSchema.safeParse(config);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  if (d.janela_fim <= d.janela_inicio) return { error: "A janela de envio precisa terminar depois de começar." };
  const lembretes = lerLembretes(d.lembretes);
  if (lembretes.length !== d.lembretes.length) {
    return { error: "Os lembretes precisam ser de 1 a 72 horas antes, sem repetir, no máximo 4." };
  }

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { error } = await supabase.from("avisos_config").upsert({
    petshop_id: petshopId,
    confirmacao_ativa: d.confirmacao_ativa,
    lembretes,
    botao_confirmar: d.botao_confirmar,
    botao_cancelar: d.botao_cancelar,
    rodape: d.rodape || null,
    janela_inicio: d.janela_inicio,
    janela_fim: d.janela_fim,
    atualizado_em: new Date().toISOString(),
  });
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/configuracoes/mensagens");
  revalidatePath("/agenda");
  return { success: true };
}
