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

/** Endereço de produção, usado quando o painel roda no computador (localhost). */
const URL_PRODUCAO = "https://bubblepets.vercel.app";

/** localhost, 127.x e IPs de rede interna não abrem no celular do tutor. */
function enderecoLocal(url: string): boolean {
  const host = url.replace(/^https?:\/\//, "").split(/[/:]/)[0] ?? "";
  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** Fallback sem requisição: variável de ambiente ou domínio da Vercel. */
function urlConfigurada(): string {
  const configurada = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configurada && !enderecoLocal(configurada)) return configurada;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return URL_PRODUCAO;
}

/**
 * URL pública do app pra links que vão pro tutor (QR code, link de
 * agendamento, remarcar). Nunca devolve localhost: rodando no computador,
 * aponta pra versão publicada — é ela que abre no celular do cliente.
 */
export async function appUrl(): Promise<string> {
  const daRequisicao = await urlDaRequisicao();
  if (daRequisicao && !enderecoLocal(daRequisicao)) return daRequisicao;
  return urlConfigurada();
}
