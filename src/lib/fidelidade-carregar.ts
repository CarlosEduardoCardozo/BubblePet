import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularCartoes,
  FIDELIDADE_PADRAO,
  hojeSP,
  type AtendimentoFidelidade,
  type Cartao,
  type FidelidadeConfig,
} from "./fidelidade";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export async function carregarConfigFidelidade(supabase: SupabaseClient, petshopId: string): Promise<FidelidadeConfig> {
  const { data } = await supabase.from("fidelidade_config").select("*").eq("petshop_id", petshopId).maybeSingle();
  if (!data) return { ...FIDELIDADE_PADRAO, contar_desde: hojeSP() };
  return { ...FIDELIDADE_PADRAO, ...data } as FidelidadeConfig;
}

const PAGINA = 1000;

/**
 * Atendimentos que contam pro programa: desde o início da contagem, mais os
 * prêmios usados. Com `tutorId`, só os desse cliente. Funciona com o client
 * do usuário (RLS) ou com o admin (rotina), sempre filtrando pelo petshop.
 */
export async function carregarCartoes(
  supabase: SupabaseClient,
  petshopId: string,
  config: FidelidadeConfig,
  tutorId?: string
): Promise<Map<string, Cartao>> {
  const atendimentos: AtendimentoFidelidade[] = [];
  for (let de = 0; ; de += PAGINA) {
    let q = supabase
      .from("agendamentos")
      .select("servico_id, inicio, status, origem_plano, fidelidade_resgate, pets!inner(tutor_id)")
      .eq("petshop_id", petshopId)
      .or(`inicio.gte.${config.contar_desde},fidelidade_resgate.eq.true`)
      .order("inicio")
      .range(de, de + PAGINA - 1);
    if (tutorId) q = q.eq("pets.tutor_id", tutorId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const pet = um(row.pets as Um<{ tutor_id: string }>);
      if (!pet) continue;
      atendimentos.push({
        tutorId: pet.tutor_id,
        servicoId: row.servico_id,
        inicio: row.inicio,
        status: row.status,
        origemPlano: row.origem_plano,
        resgate: row.fidelidade_resgate,
      });
    }
    if ((data?.length ?? 0) < PAGINA) break;
  }
  return calcularCartoes(config, atendimentos);
}

/** Cartão de um cliente só (agenda, mensagem de pronto). */
export async function cartaoDoTutor(
  supabase: SupabaseClient,
  petshopId: string,
  tutorId: string
): Promise<{ config: FidelidadeConfig; cartao: Cartao | undefined }> {
  const config = await carregarConfigFidelidade(supabase, petshopId);
  if (!config.ativo) return { config, cartao: undefined };
  const cartoes = await carregarCartoes(supabase, petshopId, config, tutorId);
  return { config, cartao: cartoes.get(tutorId) };
}
