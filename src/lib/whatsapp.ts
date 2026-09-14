import "server-only";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrlPublica } from "@/lib/app-url";
import {
  configurarWebhook,
  enviarBotoes,
  enviarDocumento,
  enviarTexto,
  UazapiError,
} from "@/lib/uazapi";

export type TipoMensagem =
  | "teste"
  | "lembrete"
  | "confirmacao"
  | "otp"
  | "fechamento"
  | "relatorio";

export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

type Instancia = {
  token: string;
  webhookSecret: string | null;
  webhookUrl: string | null;
};

/**
 * Dados da instância do petshop. Vivem em `petshop_whatsapp` (RLS sem policy),
 * então só o client admin lê — por isso este módulo é server-only.
 */
async function obterInstancia(petshopId: string): Promise<Instancia | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("petshop_whatsapp")
    .select("token, webhook_secret, webhook_url")
    .eq("petshop_id", petshopId)
    .maybeSingle();
  if (!data) return null;
  return { token: data.token, webhookSecret: data.webhook_secret, webhookUrl: data.webhook_url };
}

export async function obterTokenWhatsapp(petshopId: string): Promise<string | null> {
  return (await obterInstancia(petshopId))?.token ?? null;
}

/**
 * Garante que a UAZAPI manda as respostas dos clientes (botões Confirmar /
 * Cancelar) pra este app. Só roda na versão publicada: o localhost usa a
 * mesma instância e desviaria as respostas de produção.
 */
export async function garantirWebhook(petshopId: string): Promise<void> {
  const base = appUrlPublica();
  if (!base) return;
  const instancia = await obterInstancia(petshopId);
  if (!instancia) return;

  const segredo = instancia.webhookSecret ?? randomBytes(24).toString("base64url");
  const url = `${base}/api/webhooks/whatsapp/${segredo}`;
  if (instancia.webhookUrl === url) return;

  try {
    await configurarWebhook(instancia.token, url);
    await createAdminClient()
      .from("petshop_whatsapp")
      .update({ webhook_secret: segredo, webhook_url: url, atualizado_em: new Date().toISOString() })
      .eq("petshop_id", petshopId);
  } catch (error) {
    // Não impede o envio: a mensagem sai, só a resposta pelo botão não volta.
    console.error("Falha ao configurar webhook da UAZAPI", error);
  }
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
 * Envia texto, texto com botões ou documento pelo WhatsApp do petshop e
 * registra o resultado em `mensagens_whatsapp`. Nunca lança: quem chama
 * decide o que fazer com a falha (um agendamento não pode ser desfeito
 * porque a mensagem não saiu).
 */
export async function enviarMensagemWhatsapp(params: {
  petshopId: string;
  tutorId?: string | null;
  numeroE164: string;
  tipo: TipoMensagem;
  texto?: string;
  /** Botões de resposta; o texto vai junto. Se o envio com botões falhar, cai pra texto simples. */
  botoes?: { label: string; id: string }[];
  rodape?: string;
  documento?: { base64: string; mimetype: string; nome: string; legenda?: string };
}): Promise<ResultadoEnvio> {
  const admin = createAdminClient();
  const instancia = await obterInstancia(params.petshopId);

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

  if (!instancia) {
    const erro = "WhatsApp não conectado. Conecte em Configurações.";
    await registrar("erro", erro);
    return { ok: false, erro };
  }

  try {
    if (params.documento) {
      await enviarDocumento(instancia.token, params.numeroE164, params.documento);
    } else if (params.texto && params.botoes?.length) {
      await garantirWebhook(params.petshopId);
      try {
        await enviarBotoes(instancia.token, params.numeroE164, {
          texto: params.texto,
          botoes: params.botoes,
          rodape: params.rodape,
        });
      } catch (error) {
        // Botão recusado pela API: manda o texto com a instrução de responder.
        if (!(error instanceof UazapiError) || error.status >= 500 || error.status === 401) throw error;
        await enviarTexto(
          instancia.token,
          params.numeroE164,
          params.rodape ? `${params.texto}\n\n${params.rodape}` : params.texto
        );
      }
    } else if (params.texto) {
      await enviarTexto(instancia.token, params.numeroE164, params.texto);
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

/** Botões padrão de confirmação de um agendamento. */
export function botoesConfirmacao(agendamentoId: string) {
  return [
    { label: "✅ Confirmar", id: `confirmar:${agendamentoId}` },
    { label: "❌ Cancelar", id: `cancelar:${agendamentoId}` },
  ];
}
