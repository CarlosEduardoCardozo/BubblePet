/** Etapas de um atendimento no Painel do dia, na ordem em que acontecem. */
export const ETAPAS = ["chegou", "banho", "secagem", "pronto", "entregue"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_LABEL: Record<Etapa | "aguardando", string> = {
  aguardando: "Aguardando",
  chegou: "Chegou",
  banho: "No banho",
  secagem: "Secagem e tosa",
  pronto: "Pronto",
  entregue: "Entregue",
};

/** Texto do botão que leva pra próxima etapa. */
export const PROXIMA_ACAO: Record<Etapa | "aguardando", string | null> = {
  aguardando: "Chegou",
  chegou: "Começar banho",
  banho: "Ir pra secagem",
  secagem: "Está pronto",
  pronto: "Entregue ao tutor",
  entregue: null,
};

export function proximaEtapa(atual: Etapa | null): Etapa | null {
  if (!atual) return "chegou";
  const i = ETAPAS.indexOf(atual);
  return i < ETAPAS.length - 1 ? ETAPAS[i + 1] : null;
}

export function etapaAnterior(atual: Etapa | null): Etapa | null {
  if (!atual) return null;
  const i = ETAPAS.indexOf(atual);
  return i > 0 ? ETAPAS[i - 1] : null;
}

export function lerEtapa(raw: unknown): Etapa | null {
  return ETAPAS.includes(raw as Etapa) ? (raw as Etapa) : null;
}
