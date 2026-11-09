// Métodos de pagamento e caixas: constantes e tipos compartilhados entre a
// tela (client) e as server actions. Sem imports de servidor aqui.

export const TIPOS_METODO = [
  { valor: "dinheiro", label: "Dinheiro" },
  { valor: "pix", label: "Pix" },
  { valor: "link_pagamento", label: "Link de pagamento" },
  { valor: "cartao_credito", label: "Cartão de crédito" },
  { valor: "maquina_cartao", label: "Máquina de cartão" },
  { valor: "boleto", label: "Boleto" },
] as const;

export type TipoMetodo = (typeof TIPOS_METODO)[number]["valor"];

export const TIPOS_CAIXA = [
  { valor: "balcao", label: "Balcão" },
  { valor: "banco", label: "Conta bancária" },
  { valor: "maquininha", label: "Maquininha" },
] as const;

export type TipoCaixa = (typeof TIPOS_CAIXA)[number]["valor"];

export const PRAZOS = [
  { valor: "d1", label: "D+1 (no dia seguinte)", dias: 1 },
  { valor: "d14", label: "D+14", dias: 14 },
  { valor: "d30", label: "D+30", dias: 30 },
  { valor: "personalizado", label: "Personalizado", dias: null },
] as const;

export type PrazoModo = (typeof PRAZOS)[number]["valor"];

export const PARCELADO_MODOS = [
  { valor: "parcela_a_parcela", label: "Cai parcela a parcela (uma por mês)" },
  { valor: "tudo_junto", label: "Cai tudo junto (antecipado)" },
] as const;

export type ParceladoModo = (typeof PARCELADO_MODOS)[number]["valor"];

export const MAX_PARCELAS = 12;

/** Pix e dinheiro só existem à vista; os demais podem parcelar. */
export function aceitaParcelas(tipo: TipoMetodo): boolean {
  return tipo !== "pix" && tipo !== "dinheiro";
}

export function labelTipoMetodo(tipo: string): string {
  return TIPOS_METODO.find((t) => t.valor === tipo)?.label ?? tipo;
}

export function labelTipoCaixa(tipo: string): string {
  return TIPOS_CAIXA.find((t) => t.valor === tipo)?.label ?? tipo;
}

/** Dias de prazo coerentes com o modo (D+1, D+14, D+30). Personalizado usa o digitado. */
export function diasDoPrazo(modo: PrazoModo, personalizado: number): number {
  const fixo = PRAZOS.find((p) => p.valor === modo)?.dias;
  return fixo ?? personalizado;
}

export function resumoPrazo(modo: string, dias: number): string {
  if (modo === "personalizado") return dias === 0 ? "No ato" : `D+${dias}`;
  return `D+${dias}`;
}

/** "3,5" ou "3.5" → 3.5. Vazio ou inválido → null. */
export function parsePercentual(raw: string): number | null {
  const limpo = raw.trim().replace("%", "").replace(",", ".");
  if (!limpo) return null;
  const valor = Number(limpo);
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) return null;
  return Math.round(valor * 1000) / 1000;
}

export function formatPercentual(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export type Caixa = {
  id: string;
  nome: string;
  tipo: TipoCaixa;
  principal: boolean;
  ativo: boolean;
};

export type MetodoPagamento = {
  id: string;
  descricao: string;
  tipo: TipoMetodo;
  bandeira: string | null;
  ativo: boolean;
  caixa_id: string | null;
  /** "reais": taxa_fixa_valor em reais (ex.: 0.5). "percentual": em % (ex.: 1.2). */
  taxa_fixa_tipo: "reais" | "percentual" | null;
  taxa_fixa_valor: number | null;
  prazo_modo: PrazoModo;
  prazo_dias: number;
  parcelado_modo: ParceladoModo;
  max_parcelas: number;
  sistema: boolean;
  taxas: { parcelas: number; percentual: number }[];
};

/** O que a tela envia pra criar/editar um método. */
export type MetodoInput = {
  descricao: string;
  tipo: TipoMetodo;
  bandeira: string | null;
  caixa_id: string | null;
  taxa_fixa_tipo: "reais" | "percentual" | null;
  taxa_fixa_valor: number | null;
  prazo_modo: PrazoModo;
  prazo_dias: number;
  parcelado_modo: ParceladoModo;
  max_parcelas: number;
  taxas: { parcelas: number; percentual: number }[];
};
