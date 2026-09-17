import { DateTime } from "luxon";
import type { Adicional } from "@/lib/adicionais";

export const ZONE = "America/Sao_Paulo";

/** Competência = 1º dia do mês-calendário em America/Sao_Paulo (yyyy-MM-dd). */
export function competenciaDe(data: DateTime = DateTime.now()): string {
  return data.setZone(ZONE).startOf("month").toISODate()!;
}

/** Intervalo [inicio, fim) em ISO UTC pra filtrar `agendamentos.inicio`. */
export function intervaloCompetencia(competencia: string): { inicio: string; fim: string } {
  const inicio = DateTime.fromISO(competencia, { zone: ZONE }).startOf("month");
  return { inicio: inicio.toUTC().toISO()!, fim: inicio.plus({ months: 1 }).toUTC().toISO()! };
}

/**
 * Banho "realizado" = já passou e não foi cancelado nem marcado como falta.
 * Ninguém precisa lembrar de marcar Concluído pra ele ser cobrado.
 */
export const STATUS_REALIZADO = ["agendado", "confirmado", "concluido"] as const;

export type AgendamentoConcluido = {
  id: string;
  inicio: string;
  valor_centavos: number | null;
  origem_plano: boolean;
  adicionais?: Adicional[] | null;
  pet: { id: string; nome: string; tutor_id: string };
  servico: { nome: string; preco_centavos: number };
  /** Plano que cobriu o atendimento (só quando origem_plano). */
  plano?: { nome: string; creditos_mes: number } | null;
};

export type AssinaturaAtiva = {
  id: string;
  pet: { id: string; nome: string; tutor_id: string };
  plano: { nome: string; preco_centavos: number; creditos_mes?: number; servicoNome?: string | null };
  /** Valor combinado pra este pet; null = preço do plano. */
  preco_centavos?: number | null;
};

export type ItemFechamento = {
  /** "adicional" = extra de um atendimento (mesma data e agendamentoId). */
  tipo: "servico" | "mensalidade" | "adicional";
  descricao: string;
  petNome: string;
  /** ISO do atendimento (só serviços). */
  data?: string;
  valorCentavos: number;
  cobertoPlano?: boolean;
  agendamentoId?: string;
  assinaturaId?: string;
  /** Mês da mensalidade (yyyy-MM-dd) — evita cobrar a mesma duas vezes. */
  competencia?: string;
  /** Mensalidade e banho coberto: nome do plano (agrupa no extrato). */
  planoNome?: string;
  /** Mensalidade: banhos por mês e serviço do plano. */
  creditosMes?: number;
  servicoNome?: string;
};

export type FechamentoTutor = {
  tutorId: string;
  itens: ItemFechamento[];
  totalCentavos: number;
};

/**
 * Agrupa, por tutor, os atendimentos concluídos da competência e as
 * mensalidades das assinaturas ativas. Puro: mesma conta pro Financeiro,
 * pro PDF e pro Dashboard.
 */
export function calcularFechamentos(input: {
  agendamentos: AgendamentoConcluido[];
  assinaturas: AssinaturaAtiva[];
  /** Mês das mensalidades incluídas. */
  competencia?: string;
}): FechamentoTutor[] {
  const porTutor = new Map<string, ItemFechamento[]>();
  const push = (tutorId: string, item: ItemFechamento) => {
    const lista = porTutor.get(tutorId) ?? [];
    lista.push(item);
    porTutor.set(tutorId, lista);
  };

  const mesMensalidade = input.competencia
    ? DateTime.fromISO(input.competencia).setLocale("pt-BR").toFormat("LLLL")
    : null;
  for (const a of input.assinaturas) {
    push(a.pet.tutor_id, {
      tipo: "mensalidade",
      descricao: mesMensalidade
        ? `${a.plano.nome} — mensalidade de ${mesMensalidade}`
        : `Mensalidade — ${a.plano.nome}`,
      petNome: a.pet.nome,
      valorCentavos: a.preco_centavos ?? a.plano.preco_centavos,
      assinaturaId: a.id,
      competencia: input.competencia,
      planoNome: a.plano.nome,
      creditosMes: a.plano.creditos_mes,
      servicoNome: a.plano.servicoNome ?? undefined,
    });
  }

  const ordenados = [...input.agendamentos].sort((x, y) => x.inicio.localeCompare(y.inicio));
  for (const ag of ordenados) {
    const valor = ag.origem_plano ? 0 : (ag.valor_centavos ?? ag.servico.preco_centavos);
    push(ag.pet.tutor_id, {
      tipo: "servico",
      descricao: ag.servico.nome,
      petNome: ag.pet.nome,
      data: ag.inicio,
      valorCentavos: valor,
      cobertoPlano: ag.origem_plano,
      agendamentoId: ag.id,
      ...(ag.origem_plano && ag.plano ? { planoNome: ag.plano.nome, creditosMes: ag.plano.creditos_mes } : {}),
    });
    // Extras são cobrados mesmo quando o banho é coberto pelo plano.
    for (const extra of ag.adicionais ?? []) {
      push(ag.pet.tutor_id, {
        tipo: "adicional",
        descricao: extra.descricao,
        petNome: ag.pet.nome,
        data: ag.inicio,
        valorCentavos: extra.valorCentavos,
        agendamentoId: ag.id,
      });
    }
  }

  return Array.from(porTutor.entries()).map(([tutorId, itens]) => ({
    tutorId,
    itens,
    totalCentavos: itens.reduce((soma, i) => soma + i.valorCentavos, 0),
  }));
}

export function totalizar(fechamentos: FechamentoTutor[]): {
  previstoCentavos: number;
  atendimentos: number;
  atendimentosCobertos: number;
  mensalidadesCentavos: number;
} {
  let previsto = 0;
  let atendimentos = 0;
  let cobertos = 0;
  let mensalidades = 0;
  for (const f of fechamentos) {
    previsto += f.totalCentavos;
    for (const i of f.itens) {
      if (i.tipo === "servico") {
        atendimentos += 1;
        if (i.cobertoPlano) cobertos += 1;
      } else if (i.tipo === "mensalidade") {
        mensalidades += i.valorCentavos;
      }
    }
  }
  return {
    previstoCentavos: previsto,
    atendimentos,
    atendimentosCobertos: cobertos,
    mensalidadesCentavos: mensalidades,
  };
}
