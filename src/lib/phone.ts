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

/**
 * Chave de comparação de telefone BR: DDD + últimos 8 dígitos. O WhatsApp às
 * vezes manda o número sem o 9º dígito (JID antigo: 554799217533), então
 * "+5547999217533" e "554799217533" precisam bater.
 */
export function chaveTelefoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digitos = raw.split("@")[0].split(":")[0].replace(/\D/g, "");
  if (digitos.startsWith("55") && digitos.length >= 12) digitos = digitos.slice(2);
  if (digitos.length < 10) return null;
  return `${digitos.slice(0, 2)}${digitos.slice(-8)}`;
}
