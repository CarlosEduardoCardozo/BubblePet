/**
 * Teste grátis: 5 dias a partir do cadastro e mais 2 de tolerância (aviso
 * forte, ainda com acesso) antes de bloquear. Puro: serve ao servidor
 * (layout, bloqueio) e às telas (banner, página de assinatura).
 */

export const TESTE_DIAS = 5;
export const TOLERANCIA_DIAS = 2;

const DIA_MS = 24 * 60 * 60 * 1000;

export type SituacaoConta =
  | { tipo: "assinante" }
  /** Dentro dos 5 dias. */
  | { tipo: "teste"; diasRestantes: number; diaDoTeste: number }
  /** Teste acabou, mas ainda dá para assinar sem perder o acesso. */
  | { tipo: "tolerancia"; diasRestantes: number }
  /** Passou da tolerância: bloqueado até assinar. */
  | { tipo: "expirado" };

export function situacaoDaConta(
  planoStatus: string | null | undefined,
  testeAte: string | null | undefined,
  agora: Date = new Date()
): SituacaoConta {
  // Sem prazo gravado não há como bloquear: trata como assinante.
  if (planoStatus !== "teste" || !testeAte) return { tipo: "assinante" };
  const fim = new Date(testeAte).getTime();
  const t = agora.getTime();
  if (t < fim) {
    const diasRestantes = Math.max(1, Math.ceil((fim - t) / DIA_MS));
    return { tipo: "teste", diasRestantes, diaDoTeste: Math.min(TESTE_DIAS, Math.max(1, TESTE_DIAS - diasRestantes + 1)) };
  }
  const fimTolerancia = fim + TOLERANCIA_DIAS * DIA_MS;
  if (t < fimTolerancia) {
    return { tipo: "tolerancia", diasRestantes: Math.max(1, Math.ceil((fimTolerancia - t) / DIA_MS)) };
  }
  return { tipo: "expirado" };
}

/** "1 dia" / "3 dias". */
export function diasTexto(n: number): string {
  return n === 1 ? "1 dia" : `${n} dias`;
}

/** Prazo final do teste a partir de agora. */
export function prazoDoTeste(agora: Date = new Date()): string {
  return new Date(agora.getTime() + TESTE_DIAS * DIA_MS).toISOString();
}
