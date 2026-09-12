import "server-only";

/**
 * Cliente mínimo da UAZAPI (uazapiGO v2). Spec real em
 * https://docs.uazapi.com/openapi-bundled.json — header `token` (instância)
 * pra tudo, `admintoken` só pra criar instância.
 */

const TIMEOUT_MS = 15_000;

export class UazapiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`UAZAPI respondeu ${status}: ${body.slice(0, 200)}`);
    this.name = "UazapiError";
  }
}

function baseUrl(): string {
  const url = process.env.UAZAPI_BASE_URL;
  if (!url) throw new Error("UAZAPI_BASE_URL não configurada.");
  return url.replace(/\/$/, "");
}

async function request<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "DELETE";
    token?: string;
    adminToken?: string;
    body?: unknown;
  }
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.token = init.token;
  if (init.adminToken) headers.admintoken = init.adminToken;

  const response = await fetch(`${baseUrl()}${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) throw new UazapiError(response.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

/** +5547999998888 -> 5547999998888 (a UAZAPI quer só dígitos). */
export function paraNumeroUazapi(e164: string): string {
  return e164.replace(/\D/g, "");
}

type InstanciaBruta = {
  id?: string;
  status?: string;
  qrcode?: string | null;
  paircode?: string | null;
  profileName?: string | null;
  owner?: string | null;
};

export async function criarInstancia(
  nome: string
): Promise<{ token: string; instanceId: string | null }> {
  const adminToken = process.env.UAZAPI_ADMIN_TOKEN;
  if (!adminToken) throw new Error("UAZAPI_ADMIN_TOKEN não configurado.");

  const data = await request<{ token?: string; instance?: InstanciaBruta }>(
    "/instance/create",
    { adminToken, body: { name: nome } }
  );
  if (!data.token) throw new Error("UAZAPI não devolveu o token da instância.");
  return { token: data.token, instanceId: data.instance?.id ?? null };
}

export async function conectar(token: string): Promise<{
  connected: boolean;
  loggedIn: boolean;
  qrcode: string | null;
}> {
  const data = await request<{
    connected?: boolean;
    loggedIn?: boolean;
    instance?: InstanciaBruta;
  }>("/instance/connect", { token, body: {} });
  return {
    connected: !!data.connected,
    loggedIn: !!data.loggedIn,
    qrcode: data.instance?.qrcode ?? null,
  };
}

export type StatusInstancia = {
  connected: boolean;
  loggedIn: boolean;
  numero: string | null;
  profileNome: string | null;
  qrcode: string | null;
};

export async function statusInstancia(token: string): Promise<StatusInstancia> {
  const data = await request<{
    instance?: InstanciaBruta;
    status?: {
      connected?: boolean;
      loggedIn?: boolean;
      jid?: { user?: string } | string | null;
    };
  }>("/instance/status", { method: "GET", token });

  // JID vem como "554799217533:20@s.whatsapp.net" — o ":20" é o id do
  // aparelho conectado, não faz parte do número.
  const jid = data.status?.jid;
  const bruto =
    typeof jid === "string" ? jid : (jid?.user ?? data.instance?.owner ?? null);
  const numero = bruto ? bruto.split("@")[0].split(":")[0] : null;

  return {
    connected: !!data.status?.connected,
    loggedIn: !!data.status?.loggedIn,
    numero: numero ? `+${numero.replace(/\D/g, "")}` : null,
    profileNome: data.instance?.profileName ?? null,
    qrcode: data.instance?.qrcode ?? null,
  };
}

export async function desconectar(token: string): Promise<void> {
  await request("/instance/disconnect", { token, body: {} });
}

export async function enviarTexto(
  token: string,
  numeroE164: string,
  texto: string
): Promise<void> {
  await request("/send/text", {
    token,
    body: { number: paraNumeroUazapi(numeroE164), text: texto },
  });
}

export async function enviarDocumento(
  token: string,
  numeroE164: string,
  documento: { base64: string; mimetype: string; nome: string; legenda?: string }
): Promise<void> {
  await request("/send/media", {
    token,
    body: {
      number: paraNumeroUazapi(numeroE164),
      type: "document",
      file: `data:${documento.mimetype};base64,${documento.base64}`,
      mimetype: documento.mimetype,
      docName: documento.nome,
      text: documento.legenda,
    },
  });
}
