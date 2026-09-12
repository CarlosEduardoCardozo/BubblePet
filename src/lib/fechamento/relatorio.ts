import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { intervaloCompetencia, totalizar } from "./calcular";
import { carregarBaseFechamento } from "./carregar";
import type { RelatorioPdfInput } from "@/lib/pdf/documentos";

/** Tudo que o relatório do dono precisa pra uma competência. */
export async function dadosRelatorio(
  supabase: SupabaseClient,
  petshopId: string,
  competencia: string
): Promise<Omit<RelatorioPdfInput, "petshop">> {
  const { inicio, fim } = intervaloCompetencia(competencia);

  const [base, { data: fechamentos }, { count: planosAtivos }, { count: novosTutores }, { count: consumos }] =
    await Promise.all([
      carregarBaseFechamento(supabase, petshopId, competencia),
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

  return {
    competencia,
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
