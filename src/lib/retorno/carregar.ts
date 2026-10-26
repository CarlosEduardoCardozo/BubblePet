import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import {
  calcularRetornos,
  CONFIG_PADRAO,
  fimDoMes,
  ZONE,
  type PetBase,
  type PlanoSobrando,
  type Retorno,
  type RetornoConfig,
  type Visita,
} from "./calcular";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export type MensagemRetorno = {
  id: string;
  petId: string;
  tipo: "retorno" | "plano_sobrando";
  status: "pendente" | "enviada" | "cancelada" | "erro";
  origem: "automatico" | "manual";
  agendadaPara: string;
  enviadaEm: string | null;
  erro: string | null;
};

export type DadosRetorno = {
  config: RetornoConfig;
  retornos: Retorno[];
  planosSobrando: PlanoSobrando[];
  /** Última mensagem automática/manual de cada pet (90 dias). */
  ultimaMensagem: Map<string, MensagemRetorno>;
  /** Pets que marcaram horário depois de receber a mensagem (30 dias). */
  voltaram: { petId: string; petNome: string; enviadaEm: string; agendadoEm: string; valorCentavos: number }[];
  whatsappConectado: boolean;
  slug: string;
  petshopNome: string;
};

export async function carregarConfig(supabase: SupabaseClient, petshopId: string): Promise<RetornoConfig> {
  const { data } = await supabase.from("retorno_config").select("*").eq("petshop_id", petshopId).maybeSingle();
  if (!data) return CONFIG_PADRAO;
  return {
    ...CONFIG_PADRAO,
    ...data,
    janela_inicio: String(data.janela_inicio).slice(0, 5),
    janela_fim: String(data.janela_fim).slice(0, 5),
  } as RetornoConfig;
}

/**
 * Tudo que o painel de Oportunidades e a rotina de envio precisam. Funciona
 * com o client do usuário (RLS) ou com o admin (rotina), sempre filtrando
 * pelo petshop.
 */
export async function carregarRetornos(
  supabase: SupabaseClient,
  petshopId: string,
  agora: DateTime = DateTime.now().setZone(ZONE)
): Promise<DadosRetorno> {
  const desde = agora.minus({ days: 365 }).toUTC().toISO()!;
  const competencia = agora.startOf("month").toISODate()!;

  const [config, petshop, petsRes, agRes, msgRes, assRes] = await Promise.all([
    carregarConfig(supabase, petshopId),
    supabase.from("petshops").select("nome, slug, whatsapp_status").eq("id", petshopId).single(),
    supabase
      .from("pets")
      .select("id, nome, retorno_pausado, tutores!inner(id, nome, telefone, ativo)")
      .eq("petshop_id", petshopId)
      .eq("ativo", true)
      .eq("tutores.ativo", true),
    supabase
      .from("agendamentos")
      .select("pet_id, inicio, status, valor_centavos, criado_em, servicos(nome, preco_centavos)")
      .eq("petshop_id", petshopId)
      .gte("inicio", desde)
      .order("inicio"),
    supabase
      .from("mensagens_agendadas")
      .select("id, pet_id, tipo, status, origem, agendada_para, enviada_em, erro, criado_em")
      .eq("petshop_id", petshopId)
      .gte("criado_em", agora.minus({ days: 90 }).toUTC().toISO()!)
      .order("criado_em", { ascending: false }),
    supabase
      .from("assinaturas")
      .select("id, pet_id, planos(nome, creditos_mes, permite_acumular, ativo)")
      .eq("petshop_id", petshopId)
      .eq("status", "ativa"),
  ]);

  const pets: PetBase[] = [];
  for (const p of petsRes.data ?? []) {
    const t = um(p.tutores as Um<{ id: string; nome: string; telefone: string }>);
    if (!t) continue;
    pets.push({ petId: p.id, petNome: p.nome, tutorId: t.id, tutorNome: t.nome, telefone: t.telefone, pausado: !!p.retorno_pausado });
  }
  const petPorId = new Map(pets.map((p) => [p.petId, p]));

  const agoraIso = agora.toUTC().toISO()!;
  const visitasPorPet = new Map<string, Visita[]>();
  const petsComHorarioFuturo = new Set<string>();
  const futurosPorPet = new Map<string, { inicio: string; criadoEm: string; valor: number }[]>();
  for (const a of agRes.data ?? []) {
    const servico = um(a.servicos as Um<{ nome: string; preco_centavos: number }>);
    const valor = a.valor_centavos ?? servico?.preco_centavos ?? 0;
    if (a.status === "cancelado" || a.status === "faltou") continue;
    if (a.inicio >= agoraIso) {
      petsComHorarioFuturo.add(a.pet_id);
      const lista = futurosPorPet.get(a.pet_id) ?? [];
      lista.push({ inicio: a.inicio, criadoEm: a.criado_em, valor });
      futurosPorPet.set(a.pet_id, lista);
      continue;
    }
    const lista = visitasPorPet.get(a.pet_id) ?? [];
    lista.push({ inicio: a.inicio, servicoNome: servico?.nome ?? "banho", valorCentavos: valor });
    visitasPorPet.set(a.pet_id, lista);
  }

  const retornos = calcularRetornos({ pets, visitasPorPet, petsComHorarioFuturo, config, hoje: agora });

  // Mensagens: a mais recente de cada pet, e quem voltou depois dela.
  const ultimaMensagem = new Map<string, MensagemRetorno>();
  const voltaram: DadosRetorno["voltaram"] = [];
  for (const m of msgRes.data ?? []) {
    const msg: MensagemRetorno = {
      id: m.id, petId: m.pet_id, tipo: m.tipo, status: m.status, origem: m.origem,
      agendadaPara: m.agendada_para, enviadaEm: m.enviada_em, erro: m.erro,
    };
    if (!ultimaMensagem.has(m.pet_id)) ultimaMensagem.set(m.pet_id, msg);
    if (m.status === "enviada" && m.enviada_em && m.enviada_em >= agora.minus({ days: 30 }).toUTC().toISO()!) {
      // Voltou = marcou horário depois da mensagem (no painel ou pelo link).
      const marcado = [...(futurosPorPet.get(m.pet_id) ?? []), ...(visitasPorPet.get(m.pet_id) ?? []).map((v) => ({ inicio: v.inicio, criadoEm: v.inicio, valor: v.valorCentavos }))]
        .find((f) => f.criadoEm > m.enviada_em!);
      if (marcado && !voltaram.some((v) => v.petId === m.pet_id)) {
        voltaram.push({
          petId: m.pet_id,
          petNome: petPorId.get(m.pet_id)?.petNome ?? "Pet",
          enviadaEm: m.enviada_em,
          agendadoEm: marcado.inicio,
          valorCentavos: marcado.valor,
        });
      }
    }
  }

  // Plano com banho sobrando no fim do mês (créditos que não acumulam).
  const planosSobrando: PlanoSobrando[] = [];
  if (config.avisar_plano_sobrando && fimDoMes(agora, config)) {
    const ativas = (assRes.data ?? []).filter((a) => {
      const plano = um(a.planos as Um<{ permite_acumular: boolean; ativo: boolean }>);
      return plano?.ativo && !plano.permite_acumular;
    });
    if (ativas.length) {
      const { data: saldos } = await supabase
        .from("saldo_creditos")
        .select("assinatura_id, saldo")
        .in("assinatura_id", ativas.map((a) => a.id))
        .eq("competencia", competencia);
      const saldoPor = new Map((saldos ?? []).map((s) => [s.assinatura_id, s.saldo as number]));
      const fimMes = agora.endOf("month").toUTC().toISO()!;
      for (const a of ativas) {
        const saldo = saldoPor.get(a.id) ?? 0;
        const pet = petPorId.get(a.pet_id);
        if (saldo <= 0 || !pet) continue;
        const marcouNoMes = (futurosPorPet.get(a.pet_id) ?? []).some((f) => f.inicio <= fimMes);
        if (marcouNoMes) continue;
        const plano = um(a.planos as Um<{ nome: string; creditos_mes: number }>);
        planosSobrando.push({ ...pet, assinaturaId: a.id, planoNome: plano?.nome ?? "Plano", saldo, creditosMes: plano?.creditos_mes ?? 0 });
      }
    }
  }

  return {
    config,
    retornos,
    planosSobrando,
    ultimaMensagem,
    voltaram,
    whatsappConectado: petshop.data?.whatsapp_status === "conectado",
    slug: petshop.data?.slug ?? "",
    petshopNome: petshop.data?.nome ?? "",
  };
}
