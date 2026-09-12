import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enviarDocumento, enviarTexto, UazapiError } from "@/lib/uazapi";

export type TipoMensagem =
  | "teste"
  | "lembrete"
  | "confirmacao"
  | "otp"
  | "fechamento"
  | "relatorio";

export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

/**
 * Token da instância do petshop. Vive em `petshop_whatsapp` (RLS sem policy),
 * então só o client admin lê — por isso essa função é server-only.
 */
export async function obterTokenWhatsapp(petshopId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("petshop_whatsapp")
    .select("token")
    .eq("petshop_id", petshopId)
    .maybeSingle();
  return data?.token ?? null;
}

function descreverErro(error: unknown): string {
  if (error instanceof UazapiError) {
    if (error.status === 401 || error.status === 403) {
      return "WhatsApp desconectado ou token inválido. Reconecte em Configurações.";
    }
    return `Falha ao enviar pelo WhatsApp (${error.status}).`;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "O WhatsApp demorou demais para responder. Tente de novo.";
  }
  return "Não foi possível enviar a mensagem pelo WhatsApp.";
}

/**
 * Envia texto ou documento pelo WhatsApp do petshop e registra o resultado em
 * `mensagens_whatsapp`. Nunca lança: quem chama decide o que fazer com a
 * falha (um agendamento não pode ser desfeito porque a mensagem não saiu).
 */
export async function enviarMensagemWhatsapp(params: {
  petshopId: string;
  tutorId?: string | null;
  numeroE164: string;
  tipo: TipoMensagem;
  texto?: string;
  documento?: { base64: string; mimetype: string; nome: string; legenda?: string };
}): Promise<ResultadoEnvio> {
  const admin = createAdminClient();
  const token = await obterTokenWhatsapp(params.petshopId);

  async function registrar(status: "enviada" | "erro", erro?: string) {
    await admin.from("mensagens_whatsapp").insert({
      petshop_id: params.petshopId,
      tutor_id: params.tutorId ?? null,
      numero: params.numeroE164,
      tipo: params.tipo,
      status,
      erro: erro ?? null,
    });
  }

  if (!token) {
    const erro = "WhatsApp não conectado. Conecte em Configurações.";
    await registrar("erro", erro);
    return { ok: false, erro };
  }

  try {
    if (params.documento) {
      await enviarDocumento(token, params.numeroE164, params.documento);
    } else if (params.texto) {
      await enviarTexto(token, params.numeroE164, params.texto);
    } else {
      throw new Error("Mensagem sem texto nem documento.");
    }
    await registrar("enviada");
    return { ok: true };
  } catch (error) {
    const erro = descreverErro(error);
    await registrar("erro", erro);
    return { ok: false, erro };
  }
}
