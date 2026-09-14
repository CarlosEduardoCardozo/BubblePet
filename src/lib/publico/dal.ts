import "server-only";

import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { precoParaPorte, type PrecosServico } from "@/lib/servico-preco";
import {
  calcularHorariosLivres,
  horarioDoPetshop,
  ZONE,
  type HorarioFuncionamento,
  type Ocupado,
} from "@/lib/agenda/slots";

/**
 * Data Access Layer do link público. Único lugar (fora do envio de
 * WhatsApp) que usa o client service-role: toda função recebe o petshopId
 * resolvido a partir do slug e filtra por ele explicitamente. Devolve só o
 * que a tela precisa.
 */

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export type PetshopPublico = {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  endereco: string | null;
  whatsappConectado: boolean;
  horario: HorarioFuncionamento;
};

export async function petshopPorSlug(slug: string): Promise<PetshopPublico | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("petshops")
    .select(
      "id, nome, slug, telefone, whatsapp_numero, endereco, whatsapp_status, horario_abertura, horario_fechamento, dias_funcionamento, horario_semana, capacidade_por_horario"
    )
    .eq("slug", slug)
    // Conta congelada: o link público sai do ar junto.
    .eq("status", "ativo")
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    nome: data.nome,
    slug: data.slug,
    // Contato mostrado pro tutor ("fale com o petshop"): o WhatsApp conectado
    // é o canal real; o telefone cadastrado é o reserva.
    telefone: data.whatsapp_numero ?? data.telefone,
    endereco: data.endereco,
    whatsappConectado: data.whatsapp_status === "conectado",
    horario: horarioDoPetshop(data),
  };
}

export async function tutorPorTelefone(
  petshopId: string,
  telefone: string
): Promise<{ id: string; nome: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tutores")
    .select("id, nome")
    .eq("petshop_id", petshopId)
    .eq("telefone", telefone)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function tutorPorId(
  petshopId: string,
  tutorId: string
): Promise<{ nome: string; telefone: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tutores")
    .select("nome, telefone")
    .eq("id", tutorId)
    .eq("petshop_id", petshopId)
    .maybeSingle();
  return data ?? null;
}

export type Cobertura = { planoNome: string; saldo: number; creditosMes: number };

export type DadosAgendamento = {
  tutorNome: string;
  pets: { id: string; nome: string; especie: string; porte: string | null; planoNome: string | null }[];
  servicos: { id: string; nome: string; duracaoMin: number; precoCentavos: number; precos: PrecosServico }[];
  /** petId -> servicoId -> cobertura (só quando há assinatura ativa). */
  coberturas: Record<string, Record<string, Cobertura>>;
};

export async function dadosAgendamento(
  petshopId: string,
  tutorId: string
): Promise<DadosAgendamento | null> {
  const admin = createAdminClient();
  const competencia = DateTime.now().setZone(ZONE).startOf("month").toISODate()!;

  const [{ data: tutor }, { data: pets }, { data: servicos }] = await Promise.all([
    admin.from("tutores").select("nome").eq("id", tutorId).eq("petshop_id", petshopId).eq("ativo", true).maybeSingle(),
    admin
      .from("pets")
      .select("id, nome, especie, porte, assinaturas(id, status, planos(nome, creditos_mes, servico_id, ativo))")
      .eq("petshop_id", petshopId)
      .eq("tutor_id", tutorId)
      .eq("ativo", true)
      .order("nome"),
    admin
      .from("servicos")
      .select("id, nome, duracao_min, preco_centavos, preco_pequeno_centavos, preco_medio_centavos, preco_grande_centavos")
      .eq("petshop_id", petshopId)
      .eq("ativo", true)
      .order("preco_centavos"),
  ]);
  if (!tutor) return null;

  type AssinaturaRow = {
    id: string;
    status: string;
    planos: Um<{ nome: string; creditos_mes: number; servico_id: string; ativo: boolean }>;
  };

  const assinaturasAtivas: { petId: string; assinaturaId: string; servicoId: string; planoNome: string; creditosMes: number }[] = [];
  for (const pet of pets ?? []) {
    for (const a of (pet.assinaturas as unknown as AssinaturaRow[]) ?? []) {
      const plano = um(a.planos);
      if (a.status !== "ativa" || !plano?.ativo) continue;
      assinaturasAtivas.push({
        petId: pet.id,
        assinaturaId: a.id,
        servicoId: plano.servico_id,
        planoNome: plano.nome,
        creditosMes: plano.creditos_mes,
      });
    }
  }

  const saldoPorAssinatura = new Map<string, number>();
  if (assinaturasAtivas.length > 0) {
    const { data: saldos } = await admin
      .from("saldo_creditos")
      .select("assinatura_id, saldo")
      .in("assinatura_id", assinaturasAtivas.map((a) => a.assinaturaId))
      .eq("competencia", competencia);
    for (const s of saldos ?? []) saldoPorAssinatura.set(s.assinatura_id, s.saldo);
  }

  const coberturas: Record<string, Record<string, Cobertura>> = {};
  const planoDoPet = new Map<string, string>();
  for (const a of assinaturasAtivas) {
    coberturas[a.petId] ??= {};
    coberturas[a.petId][a.servicoId] = {
      planoNome: a.planoNome,
      saldo: saldoPorAssinatura.get(a.assinaturaId) ?? 0,
      creditosMes: a.creditosMes,
    };
    if (!planoDoPet.has(a.petId)) planoDoPet.set(a.petId, a.planoNome);
  }

  return {
    tutorNome: tutor.nome,
    pets: (pets ?? []).map((p) => ({
      id: p.id,
      nome: p.nome,
      especie: p.especie,
      porte: p.porte,
      planoNome: planoDoPet.get(p.id) ?? null,
    })),
    servicos: (servicos ?? []).map((s) => ({
      id: s.id,
      nome: s.nome,
      duracaoMin: s.duracao_min,
      precoCentavos: s.preco_centavos,
      precos: {
        preco_centavos: s.preco_centavos,
        preco_pequeno_centavos: s.preco_pequeno_centavos,
        preco_medio_centavos: s.preco_medio_centavos,
        preco_grande_centavos: s.preco_grande_centavos,
      },
    })),
    coberturas,
  };
}

export async function ocupadosNoDia(petshopId: string, dataISO: string): Promise<Ocupado[]> {
  const admin = createAdminClient();
  const dia = DateTime.fromISO(dataISO, { zone: ZONE }).startOf("day");
  const { data } = await admin
    .from("agendamentos")
    .select("inicio, fim")
    .eq("petshop_id", petshopId)
    .neq("status", "cancelado")
    .lt("inicio", dia.plus({ days: 1 }).toUTC().toISO()!)
    .gt("fim", dia.toUTC().toISO()!);
  return data ?? [];
}

export type ResultadoAgendar =
  | {
      ok: true;
      agendamentoId: string;
      inicioISO: string;
      petNome: string;
      servicoNome: string;
      coberto: boolean;
      planoNome: string | null;
      valorCentavos: number;
    }
  | { ok: false; erro: string };

const MAX_FUTUROS_POR_TUTOR = 3;

/**
 * Cria o agendamento pelo link público. Recalcula tudo no servidor: posse do
 * pet, serviço do petshop, horário livre, cobertura do plano. O preço nunca
 * vem do cliente.
 */
export async function agendarPublico(params: {
  petshopId: string;
  tutorId: string;
  petId: string;
  servicoId: string;
  dataISO: string;
  hora: string;
  horario: HorarioFuncionamento;
}): Promise<ResultadoAgendar> {
  const admin = createAdminClient();

  const [{ data: pet }, { data: servico }, dados] = await Promise.all([
    admin
      .from("pets")
      .select("id, nome, porte")
      .eq("id", params.petId)
      .eq("petshop_id", params.petshopId)
      .eq("tutor_id", params.tutorId)
      .eq("ativo", true)
      .maybeSingle(),
    admin
      .from("servicos")
      .select("id, nome, duracao_min, preco_centavos, preco_pequeno_centavos, preco_medio_centavos, preco_grande_centavos")
      .eq("id", params.servicoId)
      .eq("petshop_id", params.petshopId)
      .eq("ativo", true)
      .maybeSingle(),
    dadosAgendamento(params.petshopId, params.tutorId),
  ]);
  if (!pet || !servico || !dados) return { ok: false, erro: "Pet ou serviço não encontrado." };

  const inicio = DateTime.fromISO(`${params.dataISO}T${params.hora}`, { zone: ZONE });
  if (!inicio.isValid) return { ok: false, erro: "Data ou horário inválido." };

  const ocupados = await ocupadosNoDia(params.petshopId, params.dataISO);
  const livres = calcularHorariosLivres({
    dataISO: params.dataISO,
    duracaoMin: servico.duracao_min,
    ocupados,
    horario: params.horario,
  });
  if (!livres.some((dt) => dt.toMillis() === inicio.toMillis())) {
    return { ok: false, erro: "Esse horário acabou de ser ocupado. Escolha outro." };
  }

  const { count: futuros } = await admin
    .from("agendamentos")
    .select("id, pets!inner(tutor_id)", { count: "exact", head: true })
    .eq("petshop_id", params.petshopId)
    .eq("pets.tutor_id", params.tutorId)
    .in("status", ["agendado", "confirmado"])
    .gte("inicio", new Date().toISOString());
  if ((futuros ?? 0) >= MAX_FUTUROS_POR_TUTOR) {
    return { ok: false, erro: `Você já tem ${MAX_FUTUROS_POR_TUTOR} agendamentos marcados. Fale com o petshop para marcar mais.` };
  }

  const { count: mesmoDia } = await admin
    .from("agendamentos")
    .select("id", { count: "exact", head: true })
    .eq("pet_id", params.petId)
    .in("status", ["agendado", "confirmado"])
    .gte("inicio", inicio.startOf("day").toUTC().toISO()!)
    .lt("inicio", inicio.endOf("day").toUTC().toISO()!);
  if ((mesmoDia ?? 0) > 0) {
    return { ok: false, erro: `${pet.nome} já tem um atendimento marcado nesse dia.` };
  }

  const cobertura = dados.coberturas[params.petId]?.[params.servicoId];
  // O saldo que vale é o do mês da data escolhida (pode ser o mês que vem).
  let coberto = !!cobertura && cobertura.saldo > 0;
  if (cobertura && !inicio.hasSame(DateTime.now().setZone(ZONE), "month")) {
    const { data: assinatura } = await admin
      .from("assinaturas")
      .select("id, planos!inner(servico_id)")
      .eq("pet_id", params.petId)
      .eq("status", "ativa")
      .eq("planos.servico_id", params.servicoId)
      .limit(1)
      .maybeSingle();
    if (assinatura) {
      const { data: saldo } = await admin.rpc("saldo_plano", {
        p_assinatura_id: assinatura.id,
        p_competencia: inicio.startOf("month").toISODate(),
      });
      coberto = typeof saldo === "number" && saldo > 0;
    }
  }

  if (coberto) {
    const { data: id, error } = await admin.rpc("agendar_com_plano", {
      p_pet_id: params.petId,
      p_servico_id: params.servicoId,
      p_inicio: inicio.toUTC().toISO(),
      p_observacoes: "Agendado pelo link público",
    });
    if (error || !id) {
      return { ok: false, erro: error?.message ?? "Não foi possível agendar." };
    }
    return {
      ok: true,
      agendamentoId: id as string,
      inicioISO: inicio.toISO()!,
      petNome: pet.nome,
      servicoNome: servico.nome,
      coberto: true,
      planoNome: cobertura.planoNome,
      valorCentavos: 0,
    };
  }

  const fim = inicio.plus({ minutes: servico.duracao_min });
  const preco = precoParaPorte(servico, pet.porte);
  const { data: criado, error } = await admin
    .from("agendamentos")
    .insert({
      petshop_id: params.petshopId,
      pet_id: params.petId,
      servico_id: params.servicoId,
      inicio: inicio.toUTC().toISO(),
      fim: fim.toUTC().toISO(),
      valor_centavos: preco,
      observacoes: "Agendado pelo link público",
    })
    .select("id")
    .single();
  if (error || !criado) {
    return {
      ok: false,
      erro: error?.code === "23P01" ? "Esse horário acabou de ser ocupado. Escolha outro." : "Não foi possível agendar.",
    };
  }
  return {
    ok: true,
    agendamentoId: criado.id,
    inicioISO: inicio.toISO()!,
    petNome: pet.nome,
    servicoNome: servico.nome,
    coberto: false,
    planoNome: null,
    valorCentavos: preco,
  };
}
