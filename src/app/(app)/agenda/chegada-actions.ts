"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { semPermissao } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import QRCode from "qrcode";
import { BALDE_REGISTROS, CONDICAO_VALORES } from "@/lib/chegada";
import { criarTokenUpload } from "@/lib/upload-celular";
import { appUrl } from "@/lib/app-url";

type ActionResult = { error: string } | { success: true };

const idSchema = z.string().uuid();

const chegadaSchema = z.object({
  condicoes: z.array(z.string()).transform((v) => Array.from(new Set(v.filter((c) => CONDICAO_VALORES.includes(c))))),
  observacao: z.string().trim().max(500, "Escreva a observação em até 500 caracteres."),
  mostrarTutor: z.boolean(),
});

export async function salvarChegada(
  agendamentoId: string,
  form: { condicoes: string[]; observacao: string; mostrarTutor: boolean }
): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  if (!idSchema.safeParse(agendamentoId).success) return { error: "Atendimento inválido." };
  const parsed = chegadaSchema.safeParse(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data: ag } = await supabase.from("agendamentos").select("id").eq("id", agendamentoId).maybeSingle();
  if (!ag) return { error: "Atendimento não encontrado." };

  const { error } = await supabase.from("agendamento_chegada").upsert({
    agendamento_id: agendamentoId,
    petshop_id: petshopId,
    condicoes: parsed.data.condicoes,
    observacao: parsed.data.observacao || null,
    mostrar_tutor: parsed.data.mostrarTutor,
    atualizado_em: new Date().toISOString(),
  });
  if (error) return { error: mensagemErroBanco(error) };
  revalidatePath("/agenda");
  return { success: true };
}

/** Chamada depois que o arquivo já subiu para o armazenamento pelo navegador. */
export async function registrarMidia(
  agendamentoId: string,
  arquivo: { caminho: string; tipo: "foto" | "video"; tamanhoBytes: number }
): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  if (!idSchema.safeParse(agendamentoId).success) return { error: "Atendimento inválido." };
  if (arquivo.tipo !== "foto" && arquivo.tipo !== "video") return { error: "Tipo de arquivo inválido." };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  if (!arquivo.caminho.startsWith(`${petshopId}/${agendamentoId}/`) || arquivo.caminho.includes("..")) {
    return { error: "Arquivo inválido." };
  }
  const { data: ag } = await supabase.from("agendamentos").select("id").eq("id", agendamentoId).maybeSingle();
  if (!ag) return { error: "Atendimento não encontrado." };

  const { error } = await supabase.from("agendamento_midias").insert({
    petshop_id: petshopId,
    agendamento_id: agendamentoId,
    caminho: arquivo.caminho,
    tipo: arquivo.tipo,
    tamanho_bytes: Math.round(arquivo.tamanhoBytes),
  });
  if (error) return { error: mensagemErroBanco(error) };
  return { success: true };
}

export async function removerMidia(midiaId: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  if (!idSchema.safeParse(midiaId).success) return { error: "Arquivo inválido." };

  const supabase = await createClient();
  const { data: midia } = await supabase.from("agendamento_midias").select("id, caminho").eq("id", midiaId).maybeSingle();
  if (!midia) return { error: "Arquivo não encontrado." };

  await supabase.storage.from(BALDE_REGISTROS).remove([midia.caminho]);
  const { error } = await supabase.from("agendamento_midias").delete().eq("id", midiaId);
  if (error) return { error: mensagemErroBanco(error) };
  return { success: true };
}

/** Link e QR code para enviar fotos e vídeos deste atendimento pelo celular. */
export async function gerarEnvioCelular(
  agendamentoId: string
): Promise<{ error: string } | { url: string; qrSvg: string; validadeMin: number }> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  if (!idSchema.safeParse(agendamentoId).success) return { error: "Atendimento inválido." };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data: ag } = await supabase.from("agendamentos").select("id").eq("id", agendamentoId).maybeSingle();
  if (!ag) return { error: "Atendimento não encontrado." };

  const token = await criarTokenUpload({ agendamentoId, petshopId });
  const url = `${await appUrl()}/enviar/${token}`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, width: 224, errorCorrectionLevel: "M" });
  return { url, qrSvg, validadeMin: 30 };
}
