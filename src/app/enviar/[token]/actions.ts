"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerTokenUpload } from "@/lib/upload-celular";
import { BALDE_REGISTROS, LIMITE_MIDIA_BYTES } from "@/lib/chegada";

const MAX_ARQUIVOS_POR_ATENDIMENTO = 40;

type Preparo = { ok: true; caminho: string; tokenEnvio: string } | { ok: false; erro: string };
type Conclusao = { ok: true } | { ok: false; erro: string };

/** Reserva o lugar do arquivo e devolve a permissão para o celular enviá-lo direto ao armazenamento. */
export async function iniciarEnvioCelular(
  token: string,
  arquivo: { midia: "foto" | "video"; extensao: string; tamanhoBytes: number }
): Promise<Preparo> {
  const perm = await lerTokenUpload(token);
  if (!perm) return { ok: false, erro: "Este link expirou. Gere outro QR code no computador." };
  if (arquivo.midia !== "foto" && arquivo.midia !== "video") return { ok: false, erro: "Tipo de arquivo inválido." };
  if (!Number.isFinite(arquivo.tamanhoBytes) || arquivo.tamanhoBytes <= 0) return { ok: false, erro: "Arquivo vazio." };
  if (arquivo.tamanhoBytes > LIMITE_MIDIA_BYTES) return { ok: false, erro: "O arquivo passa de 50 MB. Grave um trecho mais curto." };

  const admin = createAdminClient();
  const { count } = await admin
    .from("agendamento_midias")
    .select("id", { count: "exact", head: true })
    .eq("agendamento_id", perm.agendamentoId);
  if ((count ?? 0) >= MAX_ARQUIVOS_POR_ATENDIMENTO) {
    return { ok: false, erro: `Este atendimento já tem ${MAX_ARQUIVOS_POR_ATENDIMENTO} arquivos.` };
  }

  const extensao = arquivo.extensao.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || (arquivo.midia === "foto" ? "jpg" : "mp4");
  const caminho = `${perm.petshopId}/${perm.agendamentoId}/${randomUUID()}.${extensao}`;
  const { data, error } = await admin.storage.from(BALDE_REGISTROS).createSignedUploadUrl(caminho);
  if (error || !data) return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
  return { ok: true, caminho, tokenEnvio: data.token };
}

/** Depois que o arquivo subiu, registra no atendimento. */
export async function concluirEnvioCelular(
  token: string,
  arquivo: { caminho: string; midia: "foto" | "video"; tamanhoBytes: number }
): Promise<Conclusao> {
  const perm = await lerTokenUpload(token);
  if (!perm) return { ok: false, erro: "Este link expirou. Gere outro QR code no computador." };
  if (!arquivo.caminho.startsWith(`${perm.petshopId}/${perm.agendamentoId}/`) || arquivo.caminho.includes("..")) {
    return { ok: false, erro: "Arquivo inválido." };
  }

  const admin = createAdminClient();
  const { data: existe } = await admin.storage.from(BALDE_REGISTROS).exists(arquivo.caminho);
  if (!existe) return { ok: false, erro: "O arquivo não chegou. Tente de novo." };

  const { error } = await admin.from("agendamento_midias").insert({
    petshop_id: perm.petshopId,
    agendamento_id: perm.agendamentoId,
    caminho: arquivo.caminho,
    tipo: arquivo.midia,
    tamanho_bytes: Math.round(arquivo.tamanhoBytes),
  });
  if (error) {
    await admin.storage.from(BALDE_REGISTROS).remove([arquivo.caminho]);
    return { ok: false, erro: "Não foi possível guardar o arquivo. Tente de novo." };
  }
  return { ok: true };
}
