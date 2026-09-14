import "server-only";

import { DateTime } from "luxon";
import type { Adicional } from "@/lib/adicionais";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularFechamentos,
  intervaloCompetencia,
  STATUS_REALIZADO,
  ZONE,
  type AgendamentoConcluido,
  type AssinaturaAtiva,
  type FechamentoTutor,
  type ItemFechamento,
} from "./calcular";

type Um<T> = T | T[] | null | undefined;
// Embeds many-to-one voltam como objeto na API real, mas a inferência do
// supabase-js sem tipos gerados não é confiável — normaliza defensivamente.
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

const SELECT_AGENDAMENTO =
  "id, inicio, valor_centavos, origem_plano, adicionais, pets(id, nome, tutor_id), servicos(nome, preco_centavos)";

type LinhaAgendamento = {
  id: string;
  inicio: string;
  valor_centavos: number | null;
  origem_plano: boolean;
  adicionais: Adicional[] | null;
  pets: unknown;
  servicos: unknown;
};

function paraAgendamentos(rows: LinhaAgendamento[] | null): AgendamentoConcluido[] {
  const lista: AgendamentoConcluido[] = [];
  for (const row of rows ?? []) {
    const pet = um(row.pets as Um<{ id: string; nome: string; tutor_id: string }>);
    const servico = um(row.servicos as Um<{ nome: string; preco_centavos: number }>);
    if (!pet || !servico) continue;
    lista.push({
      id: row.id,
      inicio: row.inicio,
      valor_centavos: row.valor_centavos,
      origem_plano: row.origem_plano,
      adicionais: row.adicionais ?? [],
      pet,
      servico,
    });
  }
  return lista;
}

async function carregarAssinaturasAtivas(
  supabase: SupabaseClient,
  petshopId: string,
  ateData?: string
): Promise<AssinaturaAtiva[]> {
  let query = supabase
    .from("assinaturas")
    .select("id, inicio, pets(id, nome, tutor_id), planos(nome, preco_centavos)")
    .eq("petshop_id", petshopId)
    .eq("status", "ativa");
  if (ateData) query = query.lte("inicio", ateData);
  const { data } = await query;

  const ativas: AssinaturaAtiva[] = [];
  for (const row of data ?? []) {
    const pet = um(row.pets as Um<{ id: string; nome: string; tutor_id: string }>);
    const plano = um(row.planos as Um<{ nome: string; preco_centavos: number }>);
    if (!pet || !plano) continue;
    ativas.push({ id: row.id, pet, plano });
  }
  return ativas;
}

async function carregarTutores(supabase: SupabaseClient, petshopId: string) {
  const { data } = await supabase.from("tutores").select("id, nome, telefone").eq("petshop_id", petshopId);
  return new Map((data ?? []).map((t) => [t.id, { nome: t.nome, telefone: t.telefone }]));
}

/**
 * Movimento do mês-calendário (pra números do Dashboard e do relatório):
 * banhos realizados na competência + mensalidades ativas. Não é o que vai
 * ser cobrado — pra isso, ver `carregarPendencias`.
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
  const agora = new Date().toISOString();
  const limite = fim < agora ? fim : agora;

  const [{ data: ags }, ativas, tutores] = await Promise.all([
    supabase
      .from("agendamentos")
      .select(SELECT_AGENDAMENTO)
      .eq("petshop_id", petshopId)
      .in("status", [...STATUS_REALIZADO])
      .gte("inicio", inicio)
      .lt("inicio", limite),
    carregarAssinaturasAtivas(supabase, petshopId),
    carregarTutores(supabase, petshopId),
  ]);

  return {
    fechamentos: calcularFechamentos({
      agendamentos: paraAgendamentos(ags as LinhaAgendamento[] | null),
      assinaturas: ativas,
      competencia,
    }),
    tutores,
  };
}

export type Pendencia = FechamentoTutor & { agendamentoIds: string[] };

/**
 * O que ainda não foi cobrado até `corte`, por cliente: todo banho realizado
 * que não está em nenhum extrato enviado/pago (os que estão no rascunho do
 * cliente entram de novo, pra recalcular) + a mensalidade da competência dos
 * planos ativos, se ainda não foi cobrada.
 */
export async function carregarPendencias(
  supabase: SupabaseClient,
  petshopId: string,
  opts: { competencia: string; corte: string; rascunhoIds: string[] }
): Promise<{ pendencias: Pendencia[]; tutores: Map<string, { nome: string; telefone: string }> }> {
  const fimCompetencia = DateTime.fromISO(opts.competencia, { zone: ZONE }).endOf("month").toISODate()!;

  let agsQuery = supabase
    .from("agendamentos")
    .select(SELECT_AGENDAMENTO)
    .eq("petshop_id", petshopId)
    .in("status", [...STATUS_REALIZADO])
    .lt("inicio", opts.corte);
  agsQuery =
    opts.rascunhoIds.length > 0
      ? agsQuery.or(`fechamento_id.is.null,fechamento_id.in.(${opts.rascunhoIds.join(",")})`)
      : agsQuery.is("fechamento_id", null);

  const [{ data: ags }, ativas, tutores, { data: congelados }] = await Promise.all([
    agsQuery,
    carregarAssinaturasAtivas(supabase, petshopId, fimCompetencia),
    carregarTutores(supabase, petshopId),
    // Extratos enviados ou pagos desta competência: a mensalidade que já
    // está num deles não entra de novo.
    supabase
      .from("fechamentos")
      .select("itens, status, enviado_em")
      .eq("petshop_id", petshopId)
      .eq("competencia", opts.competencia),
  ]);

  const jaCobradas = new Set<string>();
  for (const f of congelados ?? []) {
    if (f.status !== "pago" && !f.enviado_em) continue;
    for (const i of (f.itens as ItemFechamento[]) ?? []) {
      if (i.tipo === "mensalidade" && i.assinaturaId) jaCobradas.add(i.assinaturaId);
    }
  }

  const fechamentos = calcularFechamentos({
    agendamentos: paraAgendamentos(ags as LinhaAgendamento[] | null),
    assinaturas: ativas.filter((a) => !jaCobradas.has(a.id)),
    competencia: opts.competencia,
  });

  return {
    pendencias: fechamentos.map((f) => ({
      ...f,
      agendamentoIds: Array.from(
        new Set(f.itens.flatMap((i) => (i.agendamentoId ? [i.agendamentoId] : [])))
      ),
    })),
    tutores,
  };
}
