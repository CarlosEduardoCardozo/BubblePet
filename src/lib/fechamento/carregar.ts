import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularFechamentos,
  intervaloCompetencia,
  type AgendamentoConcluido,
  type AssinaturaAtiva,
  type FechamentoTutor,
} from "./calcular";

type Um<T> = T | T[] | null | undefined;
// Embeds many-to-one voltam como objeto na API real, mas a inferência do
// supabase-js sem tipos gerados não é confiável — normaliza defensivamente.
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/**
 * Busca no banco tudo que o cálculo precisa pra uma competência. Funciona
 * tanto com o client autenticado (RLS delimita o tenant) quanto com o admin
 * (aí `petshopId` é obrigatório no filtro).
 */
export async function carregarBaseFechamento(
  supabase: SupabaseClient,
  petshopId: string,
  competencia: string
): Promise<{
  fechamentos: FechamentoTutor[];
  tutores: Map<string, { nome: string; telefone: string }>;
}> {
  const { inicio, fim } = intervaloCompetencia(competencia);

  const [{ data: ags }, { data: assinaturas }, { data: tutores }] = await Promise.all([
    supabase
      .from("agendamentos")
      .select(
        "id, inicio, valor_centavos, origem_plano, pets(id, nome, tutor_id), servicos(nome, preco_centavos)"
      )
      .eq("petshop_id", petshopId)
      .eq("status", "concluido")
      .gte("inicio", inicio)
      .lt("inicio", fim),
    supabase
      .from("assinaturas")
      .select("id, pets(id, nome, tutor_id), planos(nome, preco_centavos)")
      .eq("petshop_id", petshopId)
      .eq("status", "ativa"),
    supabase
      .from("tutores")
      .select("id, nome, telefone")
      .eq("petshop_id", petshopId),
  ]);

  const agendamentos: AgendamentoConcluido[] = [];
  for (const row of ags ?? []) {
    const pet = um(row.pets as Um<{ id: string; nome: string; tutor_id: string }>);
    const servico = um(row.servicos as Um<{ nome: string; preco_centavos: number }>);
    if (!pet || !servico) continue;
    agendamentos.push({
      id: row.id,
      inicio: row.inicio,
      valor_centavos: row.valor_centavos,
      origem_plano: row.origem_plano,
      pet,
      servico,
    });
  }

  const ativas: AssinaturaAtiva[] = [];
  for (const row of assinaturas ?? []) {
    const pet = um(row.pets as Um<{ id: string; nome: string; tutor_id: string }>);
    const plano = um(row.planos as Um<{ nome: string; preco_centavos: number }>);
    if (!pet || !plano) continue;
    ativas.push({ id: row.id, pet, plano });
  }

  return {
    fechamentos: calcularFechamentos({ agendamentos, assinaturas: ativas }),
    tutores: new Map((tutores ?? []).map((t) => [t.id, { nome: t.nome, telefone: t.telefone }])),
  };
}
