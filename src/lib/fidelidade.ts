import { DateTime } from "luxon";

/** Hoje em São Paulo (yyyy-MM-dd). */
export function hojeSP(): string {
  return DateTime.now().setZone("America/Sao_Paulo").toISODate()!;
}

/**
 * Cartão fidelidade: a cada `meta` atendimentos pagos o cliente ganha um
 * prêmio. Puro: mesma conta pra tela de Fidelidade, agenda, mensagens e rotina.
 */

export type FidelidadeConfig = {
  ativo: boolean;
  meta: number;
  desconto_pct: number;
  premio: string;
  servico_ids: string[] | null;
  avisar_whatsapp: boolean;
  /** yyyy-MM-dd */
  contar_desde: string;
};

export const FIDELIDADE_PADRAO: FidelidadeConfig = {
  ativo: false,
  meta: 10,
  desconto_pct: 100,
  premio: "Banho grátis",
  servico_ids: null,
  avisar_whatsapp: true,
  contar_desde: "",
};

/** Banho "realizado", como no fechamento: já passou e não foi cancelado nem falta. */
const REALIZADO = new Set(["agendado", "confirmado", "concluido"]);

export type AtendimentoFidelidade = {
  tutorId: string;
  servicoId: string;
  inicio: string;
  status: string;
  origemPlano: boolean;
  resgate: boolean;
};

export type Cartao = {
  tutorId: string;
  /** Atendimentos que contaram carimbo desde o início do programa. */
  carimbos: number;
  ganhos: number;
  usados: number;
  disponiveis: number;
  /** Carimbos no cartão atual (0 a meta-1). */
  progresso: number;
  faltam: number;
  ultimoCarimbo: string | null;
};

export function contaCarimbo(config: FidelidadeConfig, a: AtendimentoFidelidade, agoraISO: string): boolean {
  if (a.resgate || a.origemPlano) return false;
  if (!REALIZADO.has(a.status)) return false;
  if (a.inicio > agoraISO) return false;
  if (DateTime.fromISO(a.inicio).setZone("America/Sao_Paulo").toISODate()! < config.contar_desde) return false;
  return !config.servico_ids || config.servico_ids.includes(a.servicoId);
}

/** Prêmio usado: marcado num atendimento que não foi cancelado (pode ser futuro). */
function usaPremio(a: AtendimentoFidelidade): boolean {
  return a.resgate && a.status !== "cancelado" && a.status !== "faltou";
}

export function calcularCartoes(
  config: FidelidadeConfig,
  atendimentos: AtendimentoFidelidade[],
  agoraISO: string = new Date().toISOString()
): Map<string, Cartao> {
  const cartoes = new Map<string, Cartao>();
  const cartao = (tutorId: string) => {
    let c = cartoes.get(tutorId);
    if (!c) {
      c = { tutorId, carimbos: 0, ganhos: 0, usados: 0, disponiveis: 0, progresso: 0, faltam: config.meta, ultimoCarimbo: null };
      cartoes.set(tutorId, c);
    }
    return c;
  };
  for (const a of atendimentos) {
    if (contaCarimbo(config, a, agoraISO)) {
      const c = cartao(a.tutorId);
      c.carimbos++;
      if (!c.ultimoCarimbo || a.inicio > c.ultimoCarimbo) c.ultimoCarimbo = a.inicio;
    } else if (usaPremio(a)) {
      cartao(a.tutorId).usados++;
    }
  }
  for (const c of cartoes.values()) {
    c.ganhos = Math.floor(c.carimbos / config.meta);
    c.disponiveis = Math.max(0, c.ganhos - c.usados);
    c.progresso = c.carimbos % config.meta;
    c.faltam = config.meta - c.progresso;
  }
  return cartoes;
}

/** Valor do serviço depois do prêmio. */
export function valorComPremio(valorCentavos: number, descontoPct: number): number {
  return Math.max(0, Math.round((valorCentavos * (100 - descontoPct)) / 100));
}

/** Linha pro tutor ver no WhatsApp ("Faltam 3 banhos para o Banho grátis"). */
export function frasePrograma(config: FidelidadeConfig, c: Cartao | undefined): string {
  if (!config.ativo) return "";
  if (c && c.disponiveis > 0) return `🎁 Você tem *${config.premio}* no cartão fidelidade! É só pedir no próximo atendimento.`;
  const faltam = c?.faltam ?? config.meta;
  const progresso = c?.progresso ?? 0;
  return `🐾 Cartão fidelidade: ${progresso} de ${config.meta}. Faltam ${faltam} para ganhar *${config.premio}*.`;
}
