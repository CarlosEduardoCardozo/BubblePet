export const AGENDAMENTO_STATUSES = [
  "agendado",
  "confirmado",
  "concluido",
  "cancelado",
  "faltou",
] as const;
export type AgendamentoStatus = (typeof AGENDAMENTO_STATUSES)[number];

export const STATUS_LABELS: Record<AgendamentoStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

// Mantém sincronizado com --status-* em src/app/globals.css.
export const STATUS_COLORS: Record<AgendamentoStatus, string> = {
  agendado: "#2563eb",
  confirmado: "#0d9488",
  concluido: "#16a34a",
  cancelado: "#6b7280",
  faltou: "#dc2626",
};

/** Classes de badge (fundo suave + texto na cor do status). */
export const STATUS_BADGE_CLASS: Record<AgendamentoStatus, string> = {
  agendado: "bg-status-agendado/10 text-status-agendado",
  confirmado: "bg-status-confirmado/10 text-status-confirmado",
  concluido: "bg-status-concluido/10 text-status-concluido",
  cancelado: "bg-status-cancelado/10 text-status-cancelado",
  faltou: "bg-status-faltou/10 text-status-faltou",
};
