import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, statusInstancia, UazapiError } from "@/lib/uazapi";

export type ConfigPlataforma = {
  linkAssinatura: string | null;
  precoMensalCentavos: number | null;
  contatoWhatsapp: string | null;
  disparoUrl: string | null;
  disparoToken: string | null;
  disparoPorHora: number;
};

/** Configuração da plataforma (uma linha). Só o servidor lê: o token nunca vai para o navegador. */
export async function carregarConfigPlataforma(): Promise<ConfigPlataforma> {
  const { data } = await createAdminClient().from("plataforma_config").select("*").eq("id", 1).maybeSingle();
  return {
    linkAssinatura: data?.link_assinatura ?? null,
    precoMensalCentavos: data?.preco_mensal_centavos ?? null,
    contatoWhatsapp: data?.contato_whatsapp ?? null,
    disparoUrl: data?.disparo_url ?? null,
    disparoToken: data?.disparo_token ?? null,
    disparoPorHora: data?.disparo_por_hora ?? 60,
  };
}

export type StatusPlataforma =
  | { configurado: false }
  | { configurado: true; conectado: boolean; numero: string | null; nome: string | null; erro?: string };

/** Confere na UAZAPI se a instância configurada está conectada. */
export async function statusDaPlataforma(config?: ConfigPlataforma): Promise<StatusPlataforma> {
  const c = config ?? (await carregarConfigPlataforma());
  if (!c.disparoUrl || !c.disparoToken) return { configurado: false };
  try {
    const s = await statusInstancia(c.disparoToken, c.disparoUrl);
    return { configurado: true, conectado: s.loggedIn, numero: s.numero, nome: s.profileNome };
  } catch (e) {
    const erro =
      e instanceof UazapiError && (e.status === 401 || e.status === 403)
        ? "O servidor recusou o token."
        : "Não foi possível falar com o servidor.";
    return { configurado: true, conectado: false, numero: null, nome: null, erro };
  }
}

export type ResultadoEnvioPlataforma = { ok: true } | { ok: false; erro: string };

/** Manda um texto pelo WhatsApp da plataforma (o número configurado no admin). */
export async function enviarPelaPlataforma(
  numeroE164: string,
  texto: string,
  config?: ConfigPlataforma
): Promise<ResultadoEnvioPlataforma> {
  const c = config ?? (await carregarConfigPlataforma());
  if (!c.disparoUrl || !c.disparoToken) return { ok: false, erro: "Configure o servidor e o token em Admin › Plataforma." };
  try {
    await enviarTexto(c.disparoToken, numeroE164, texto, c.disparoUrl);
    return { ok: true };
  } catch (e) {
    if (e instanceof UazapiError) {
      return {
        ok: false,
        erro: e.status === 401 || e.status === 403 ? "O token da plataforma foi recusado." : `A UAZAPI respondeu com erro ${e.status}.`,
      };
    }
    return { ok: false, erro: "Não foi possível enviar agora." };
  }
}
