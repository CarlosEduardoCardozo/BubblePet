import "server-only";

import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { competenciaDe, intervaloCompetencia, totalizar, ZONE, type FechamentoTutor } from "@/lib/fechamento/calcular";
import { carregarBaseFechamento } from "@/lib/fechamento/carregar";
import { carregarRetornos } from "@/lib/retorno/carregar";

export const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export type MesRelatorio = {
  competencia: string;
  /** "out/26" */
  rotulo: string;
  /** Mês ainda em andamento: os números ainda vão crescer. */
  parcial: boolean;
  movimentoCentavos: number;
  mensalidadesCentavos: number;
  avulsoCentavos: number;
  atendimentos: number;
  atendimentosPlano: number;
  clientes: number;
  faltas: number;
  cancelados: number;
  /** Dos clientes do mês anterior, quantos voltaram neste. null = sem mês anterior para comparar. */
  retencaoPct: number | null;
  retidos: number;
  baseRetencao: number;
};

export type RelatorioAvancado = {
  meses: MesRelatorio[];
  porServico: { nome: string; quantidade: number; valorCentavos: number }[];
  porDiaSemana: { nome: string; quantidade: number }[];
  topClientes: { nome: string; movimentoCentavos: number; atendimentos: number }[];
  totais: {
    movimentoCentavos: number;
    atendimentos: number;
    clientes: number;
    faltas: number;
    cancelados: number;
    retencaoMediaPct: number | null;
  };
  clientesParaChamar: number;
};

function tutoresAtendidos(fechamentos: FechamentoTutor[]): Set<string> {
  return new Set(fechamentos.filter((f) => f.itens.some((i) => i.tipo === "servico")).map((f) => f.tutorId));
}

/** Os últimos `quantidade` meses, do mais antigo para o atual. */
export function ultimasCompetencias(quantidade: number): string[] {
  const atual = DateTime.fromISO(competenciaDe(), { zone: ZONE });
  return Array.from({ length: quantidade }, (_, i) => atual.minus({ months: quantidade - 1 - i }).toISODate()!);
}

export async function carregarRelatorioAvancado(
  supabase: SupabaseClient,
  petshopId: string,
  quantidadeMeses: number
): Promise<RelatorioAvancado> {
  // Um mês a mais no começo, só para calcular a retenção do primeiro mês mostrado.
  const competencias = ultimasCompetencias(quantidadeMeses + 1);
  const agora = new Date().toISOString();

  const contarStatus = async (competencia: string, status: "faltou" | "cancelado") => {
    const { inicio, fim } = intervaloCompetencia(competencia);
    const { count } = await supabase
      .from("agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("petshop_id", petshopId)
      .eq("status", status)
      .gte("inicio", inicio)
      .lt("inicio", fim < agora ? fim : agora);
    return count ?? 0;
  };

  const [bases, faltas, cancelados, retornos] = await Promise.all([
    Promise.all(competencias.map((c) => carregarBaseFechamento(supabase, petshopId, c))),
    Promise.all(competencias.map((c) => contarStatus(c, "faltou"))),
    Promise.all(competencias.map((c) => contarStatus(c, "cancelado"))),
    carregarRetornos(supabase, petshopId).catch(() => null),
  ]);

  const mesAtual = competenciaDe();
  const atendidos = bases.map((b) => tutoresAtendidos(b.fechamentos));

  const meses: MesRelatorio[] = competencias.map((competencia, i) => {
    const totais = totalizar(bases[i].fechamentos);
    const anterior = i > 0 ? atendidos[i - 1] : null;
    const retidos = anterior ? Array.from(anterior).filter((id) => atendidos[i].has(id)).length : 0;
    return {
      competencia,
      rotulo: DateTime.fromISO(competencia).setLocale("pt-BR").toFormat("LLL/yy").replace(".", ""),
      parcial: competencia === mesAtual,
      movimentoCentavos: totais.previstoCentavos,
      mensalidadesCentavos: totais.mensalidadesCentavos,
      avulsoCentavos: totais.previstoCentavos - totais.mensalidadesCentavos,
      atendimentos: totais.atendimentos,
      atendimentosPlano: totais.atendimentosCobertos,
      clientes: atendidos[i].size,
      faltas: faltas[i],
      cancelados: cancelados[i],
      retencaoPct: anterior && anterior.size > 0 ? Math.round((retidos / anterior.size) * 100) : null,
      retidos,
      baseRetencao: anterior?.size ?? 0,
    };
  });

  // O mês extra do começo só serviu de base para a retenção.
  const mostrados = meses.slice(1);
  const indices = competencias.map((_, i) => i).slice(1);

  const porServicoMap = new Map<string, { quantidade: number; valorCentavos: number }>();
  const porDia = new Array<number>(7).fill(0);
  const porTutor = new Map<string, { nome: string; movimentoCentavos: number; atendimentos: number }>();
  const clientesNoPeriodo = new Set<string>();

  for (const i of indices) {
    for (const f of bases[i].fechamentos) {
      const nome = bases[i].tutores.get(f.tutorId)?.nome ?? "Cliente";
      const acumulado = porTutor.get(f.tutorId) ?? { nome, movimentoCentavos: 0, atendimentos: 0 };
      acumulado.movimentoCentavos += f.totalCentavos;
      for (const item of f.itens) {
        if (item.tipo !== "servico") continue;
        acumulado.atendimentos += 1;
        clientesNoPeriodo.add(f.tutorId);
        const s = porServicoMap.get(item.descricao) ?? { quantidade: 0, valorCentavos: 0 };
        s.quantidade += 1;
        s.valorCentavos += item.valorCentavos;
        porServicoMap.set(item.descricao, s);
        if (item.data) porDia[DateTime.fromISO(item.data).setZone(ZONE).weekday - 1]++;
      }
      porTutor.set(f.tutorId, acumulado);
    }
  }

  // Retenção média só com meses fechados: o mês em andamento ainda não terminou.
  const retencoes = mostrados.filter((m) => !m.parcial && m.retencaoPct != null).map((m) => m.retencaoPct as number);

  return {
    meses: mostrados,
    porServico: Array.from(porServicoMap.entries())
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.quantidade - a.quantidade),
    porDiaSemana: DIAS_SEMANA.map((nome, i) => ({ nome, quantidade: porDia[i] })),
    topClientes: Array.from(porTutor.values())
      .filter((c) => c.atendimentos > 0)
      .sort((a, b) => b.movimentoCentavos - a.movimentoCentavos)
      .slice(0, 10),
    totais: {
      movimentoCentavos: mostrados.reduce((s, m) => s + m.movimentoCentavos, 0),
      atendimentos: mostrados.reduce((s, m) => s + m.atendimentos, 0),
      clientes: clientesNoPeriodo.size,
      faltas: mostrados.reduce((s, m) => s + m.faltas, 0),
      cancelados: mostrados.reduce((s, m) => s + m.cancelados, 0),
      retencaoMediaPct: retencoes.length ? Math.round(retencoes.reduce((s, n) => s + n, 0) / retencoes.length) : null,
    },
    clientesParaChamar: retornos?.retornos.length ?? 0,
  };
}
