/** Normaliza telefone para E.164, assumindo BR quando não há código de país. */
export function normalizePhoneBR(raw: string): string | null {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return `+${digits}`;
  }

  return null;
}

/** Formata um telefone E.164 brasileiro para exibição: +5547999998888 -> (47) 99999-8888 */
export function formatPhoneBR(e164: string): string {
  const match = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  if (!match) return e164;
  const [, ddd, prefix, suffix] = match;
  return `(${ddd}) ${prefix}-${suffix}`;
}
