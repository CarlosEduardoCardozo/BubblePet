import { DateTime } from "luxon";

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

export type AgendamentoConcluido = {
  id: string;
  inicio: string;
  valor_centavos: number | null;
  origem_plano: boolean;
  pet: { id: string; nome: string; tutor_id: string };
  servico: { nome: string; preco_centavos: number };
};

export type AssinaturaAtiva = {
  id: string;
  pet: { id: string; nome: string; tutor_id: string };
  plano: { nome: string; preco_centavos: number };
};

export type ItemFechamento = {
  tipo: "servico" | "mensalidade";
  descricao: string;
  petNome: string;
  /** ISO do atendimento (só serviços). */
  data?: string;
  valorCentavos: number;
  cobertoPlano?: boolean;
  agendamentoId?: string;
  assinaturaId?: string;
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
}): FechamentoTutor[] {
  const porTutor = new Map<string, ItemFechamento[]>();
  const push = (tutorId: string, item: ItemFechamento) => {
    const lista = porTutor.get(tutorId) ?? [];
    lista.push(item);
    porTutor.set(tutorId, lista);
  };

  for (const a of input.assinaturas) {
    push(a.pet.tutor_id, {
      tipo: "mensalidade",
      descricao: `Mensalidade — ${a.plano.nome}`,
      petNome: a.pet.nome,
      valorCentavos: a.plano.preco_centavos,
      assinaturaId: a.id,
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
    });
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
      } else {
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
