"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { semPermissao } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { enviarAgora, previaMensagem } from "@/lib/retorno/enviar";

type ActionResult = { error: string } | { success: true };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const configSchema = z
  .object({
    dias_antes: z.coerce.number().int().min(0).max(15),
    intervalo_padrao_dias: z.coerce.number().int().min(7).max(120),
    janela_inicio: z.string().regex(HORA, "Horário inválido"),
    janela_fim: z.string().regex(HORA, "Horário inválido"),
    intervalo_envio_min: z.coerce.number().int().min(5, "Mínimo de 5 minutos entre mensagens").max(120),
    limite_dia: z.coerce.number().int().min(1).max(50),
    reenviar_apos_dias: z.coerce.number().int().min(7).max(90),
    avisar_plano_sobrando: z.boolean(),
    dias_fim_mes: z.coerce.number().int().min(3).max(20),
    usar_ia: z.boolean(),
    tom_ia: z
      .string()
      .trim()
      .max(300, "Descreva o tom em até 300 caracteres.")
      .transform((t) => t || null)
      .nullable(),
  })
  .refine((c) => c.janela_fim > c.janela_inicio, { message: "O fim da janela tem que ser depois do início." });

type Numero = number | string;
export type ConfigForm = {
  dias_antes: Numero;
  intervalo_padrao_dias: Numero;
  janela_inicio: string;
  janela_fim: string;
  intervalo_envio_min: Numero;
  limite_dia: Numero;
  reenviar_apos_dias: Numero;
  avisar_plano_sobrando: boolean;
  dias_fim_mes: Numero;
  usar_ia: boolean;
  tom_ia: string | null;
};

export async function salvarConfigRetorno(form: ConfigForm): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const parsed = configSchema.safeParse(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { error } = await supabase
    .from("retorno_config")
    // Mudou a regra: a fila de hoje é montada de novo na próxima rodada.
    .upsert({ petshop_id: petshopId, ...parsed.data, planejado_em: null, atualizado_em: new Date().toISOString() });
  if (error) return { error: mensagemErroBanco(error) };
  await cancelarPendentes(supabase, petshopId, "Regras de envio alteradas");
  revalidatePath("/oportunidades");
  return { success: true };
}

export async function alternarRetornoAutomatico(ativo: boolean): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { error } = await supabase
    .from("retorno_config")
    .upsert({ petshop_id: petshopId, ativo, planejado_em: null, atualizado_em: new Date().toISOString() });
  if (error) return { error: mensagemErroBanco(error) };
  if (!ativo) await cancelarPendentes(supabase, petshopId, "Envio automático desligado");
  revalidatePath("/oportunidades");
  return { success: true };
}

async function cancelarPendentes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  petshopId: string,
  motivo: string
) {
  await supabase
    .from("mensagens_agendadas")
    .update({ status: "cancelada", erro: motivo })
    .eq("petshop_id", petshopId)
    .eq("status", "pendente");
}

export async function enviarAgoraAction(
  petId: string,
  tipo: "retorno" | "plano_sobrando",
  texto: string
): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const limpo = texto.trim();
  if (limpo.length < 10) return { error: "Escreva a mensagem antes de enviar." };
  if (limpo.length > 2000) return { error: "A mensagem passou de 2000 caracteres." };
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const r = await enviarAgora(supabase, petshopId, petId, tipo, limpo);
  revalidatePath("/oportunidades");
  return r.ok ? { success: true } : { error: r.erro };
}

/** "Não incomodar": o pet sai das mensagens automáticas (e a pendência dele é cancelada). */
export async function pausarRetornoPet(petId: string, pausado: boolean): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { error } = await supabase.from("pets").update({ retorno_pausado: pausado }).eq("id", petId);
  if (error) return { error: mensagemErroBanco(error) };
  if (pausado) {
    await supabase
      .from("mensagens_agendadas")
      .update({ status: "cancelada", erro: "Pet pausado" })
      .eq("pet_id", petId)
      .eq("status", "pendente");
  }
  revalidatePath("/oportunidades");
  return { success: true };
}

/** Texto da mensagem antes de enviar: padrão ou escrito pela IA. */
export async function previaMensagemAction(
  petId: string,
  tipo: "retorno" | "plano_sobrando",
  comIa: boolean
): Promise<{ error: string } | { texto: string; porIa: boolean; erroIa?: string }> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const r = await previaMensagem(supabase, petshopId, petId, tipo, comIa);
  return "erro" in r ? { error: r.erro } : r;
}
