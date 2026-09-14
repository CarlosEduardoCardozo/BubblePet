import { headers } from "next/headers";

/**
 * Endereço pelo qual o app está sendo acessado agora (host da requisição).
 * É a única URL garantidamente no ar: um domínio próprio pode estar ligado
 * ao projeto na Vercel sem o DNS configurado ainda. Fora de uma requisição
 * (ou sem host), devolve null.
 */
export async function urlDaRequisicao(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const local = host.startsWith("localhost") || host.startsWith("127.");
    const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

/** Fallback sem requisição: variável de ambiente ou domínio da Vercel. */
function urlConfigurada(): string {
  const configurada = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configurada && !configurada.includes("localhost")) return configurada;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return configurada ?? "http://localhost:3000";
}

/** URL pública do app pra links mostrados ou enviados (QR code, remarcar). */
export async function appUrl(): Promise<string> {
  return (await urlDaRequisicao()) ?? urlConfigurada();
}
