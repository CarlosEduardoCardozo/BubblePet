/** Converte texto digitado ("89,90", "89.90", "8990") para centavos. Nunca guardamos float. */
export function parseCentavos(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;

  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function formatCentavos(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
