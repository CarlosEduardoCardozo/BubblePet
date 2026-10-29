import "server-only";

import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { intervaloCompetencia, totalizar, ZONE, type FechamentoTutor } from "./calcular";
import { carregarCartoes, carregarConfigFidelidade } from "@/lib/fidelidade-carregar";
import { carregarBaseFechamento } from "./carregar";
import type { RelatorioPdfInput } from "@/lib/pdf/documentos";

const DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function tutoresAtendidos(fechamentos: FechamentoTutor[]): Set<string> {
  return new Set(fechamentos.filter((f) => f.itens.some((i) => i.tipo === "servico")).map((f) => f.tutorId));
}

/** Tudo que o relatório do dono precisa pra uma competência. */
export async function dadosRelatorio(
  supabase: SupabaseClient,
  petshopId: string,
  competencia: string
): Promise<Omit<RelatorioPdfInput, "petshop">> {
  const { inicio, fim } = intervaloCompetencia(competencia);

  const anteriorISO = DateTime.fromISO(competencia, { zone: ZONE }).minus({ months: 1 }).toISODate()!;
  const agora = new Date().toISOString();
  const fimFaltas = fim < agora ? fim : agora;

  const [
    base,
    baseAnterior,
    { count: faltas },
    { count: cancelados },
    configFidelidade,
    { data: fechamentos },
    { count: planosAtivos },
    { count: novosTutores },
    { count: consumos },
  ] = await Promise.all([
      carregarBaseFechamento(supabase, petshopId, competencia),
      carregarBaseFechamento(supabase, petshopId, anteriorISO),
      supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("petshop_id", petshopId)
        .eq("status", "faltou")
        .gte("inicio", inicio)
        .lt("inicio", fimFaltas),
      supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("petshop_id", petshopId)
        .eq("status", "cancelado")
        .gte("inicio", inicio)
        .lt("inicio", fimFaltas),
      carregarConfigFidelidade(supabase, petshopId),
      supabase
        .from("fechamentos")
        .select("tutor_id, total_centavos, status")
        .eq("petshop_id", petshopId)
        .eq("competencia", competencia),
      supabase
        .from("assinaturas")
        .select("id", { count: "exact", head: true })
        .eq("petshop_id", petshopId)
        .eq("status", "ativa"),
      supabase
        .from("tutores")
        .select("id", { count: "exact", head: true })
        .eq("petshop_id", petshopId)
        .gte("criado_em", inicio)
        .lt("criado_em", fim),
      supabase
        .from("creditos_movimentos")
        .select("id", { count: "exact", head: true })
        .eq("petshop_id", petshopId)
        .eq("tipo", "consumo")
        .eq("competencia", competencia),
    ]);

  const totais = totalizar(base.fechamentos);
  const statusPorTutor = new Map((fechamentos ?? []).map((f) => [f.tutor_id, f]));

  let recebido = 0;
  let emAberto = 0;
  for (const f of fechamentos ?? []) {
    if (f.status === "pago") recebido += f.total_centavos;
    else emAberto += f.total_centavos;
  }

  const porServicoMap = new Map<string, { quantidade: number; valorCentavos: number }>();
  for (const f of base.fechamentos) {
    for (const i of f.itens) {
      if (i.tipo !== "servico") continue;
      const atual = porServicoMap.get(i.descricao) ?? { quantidade: 0, valorCentavos: 0 };
      atual.quantidade += 1;
      atual.valorCentavos += i.valorCentavos;
      porServicoMap.set(i.descricao, atual);
    }
  }

  const totaisAnterior = totalizar(baseAnterior.fechamentos);
  const atendidos = tutoresAtendidos(base.fechamentos);
  const atendidosAntes = tutoresAtendidos(baseAnterior.fechamentos);

  const porDia = new Array<number>(7).fill(0);
  for (const f of base.fechamentos) {
    for (const i of f.itens) {
      if (i.tipo === "servico" && i.data) porDia[DateTime.fromISO(i.data).setZone(ZONE).weekday - 1]++;
    }
  }
  const maxDia = Math.max(...porDia);
  const diasMovimento = DIAS.map((nome, idx) => ({ nome, quantidade: porDia[idx] }));

  let fidelidade: RelatorioPdfInput["fidelidade"] = null;
  if (configFidelidade.ativo) {
    const [cartoes, { count: premiosUsados }] = await Promise.all([
      carregarCartoes(supabase, petshopId, configFidelidade).catch(() => null),
      supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("petshop_id", petshopId)
        .eq("fidelidade_resgate", true)
        .gte("inicio", inicio)
        .lt("inicio", fim),
    ]);
    const lista = cartoes ? Array.from(cartoes.values()) : [];
    fidelidade = {
      premio: configFidelidade.premio,
      premiosUsadosNoMes: premiosUsados ?? 0,
      clientesComPremio: lista.filter((c) => c.disponiveis > 0).length,
      clientesNoPrograma: lista.length,
    };
  }

  return {
    competencia,
    parcial: fim > agora,
    anterior: {
      competencia: anteriorISO,
      previstoCentavos: totaisAnterior.previstoCentavos,
      atendimentos: totaisAnterior.atendimentos,
    },
    faltas: faltas ?? 0,
    cancelados: cancelados ?? 0,
    clientesAtendidos: atendidos.size,
    clientesQueVoltaram: Array.from(atendidos).filter((id) => atendidosAntes.has(id)).length,
    clientesDoMesAnterior: atendidosAntes.size,
    melhoresDias: diasMovimento
      .filter((d) => d.quantidade > 0 && d.quantidade === maxDia)
      .map((d) => d.nome),
    diasMovimento,
    fidelidade,
    previstoCentavos: totais.previstoCentavos,
    recebidoCentavos: recebido,
    emAbertoCentavos: emAberto,
    mensalidadesCentavos: totais.mensalidadesCentavos,
    atendimentos: totais.atendimentos,
    atendimentosCobertos: totais.atendimentosCobertos,
    planosAtivos: planosAtivos ?? 0,
    novosTutores: novosTutores ?? 0,
    creditosConsumidos: consumos ?? 0,
    porServico: Array.from(porServicoMap.entries())
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.quantidade - a.quantidade),
    porTutor: base.fechamentos
      .map((f) => ({
        nome: base.tutores.get(f.tutorId)?.nome ?? "Cliente",
        totalCentavos: f.totalCentavos,
        status: ((statusPorTutor.get(f.tutorId)?.status as "aberto" | "pago" | undefined) ??
          "nao_gerado") as "aberto" | "pago" | "nao_gerado",
      }))
      .sort((a, b) => b.totalCentavos - a.totalCentavos),
  };
}
