export const AGENDAMENTO_STATUSES = [
  "agendado",
  "confirmado",
  "concluido",
  "cancelado",
  "faltou",
] as const;
export type AgendamentoStatus = (typeof AGENDAMENTO_STATUSES)[number];
