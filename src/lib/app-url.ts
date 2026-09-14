/**
 * URL pública do app. Em produção na Vercel, se NEXT_PUBLIC_APP_URL não
 * estiver definida (ou ainda apontar pro localhost), usa o domínio de
 * produção que a própria Vercel injeta.
 */
export function appUrl(): string {
  const configurada = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configurada && !(vercel && configurada.includes("localhost"))) return configurada;
  if (vercel) return `https://${vercel}`;
  return configurada ?? "http://localhost:3000";
}

/** Só uma URL https alcançável de fora pode receber o webhook da UAZAPI. */
export function appUrlPublica(): string | null {
  const url = appUrl();
  return url.startsWith("https://") && !url.includes("localhost") ? url : null;
}
