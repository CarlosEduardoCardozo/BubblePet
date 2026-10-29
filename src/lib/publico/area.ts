import "server-only";

import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { BALDE_REGISTROS, rotuloCondicao } from "@/lib/chegada";
import { frasePrograma } from "@/lib/fidelidade";
import { carregarCartoes, carregarConfigFidelidade } from "@/lib/fidelidade-carregar";
import { dadosAgendamento } from "./dal";

/** Até quantas horas antes o tutor ainda pode cancelar ou remarcar sozinho. */
export const ANTECEDENCIA_ALTERAR_HORAS = 3;

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export type ProximoAtendimento = {
  id: string;
  inicioISO: string;
  petNome: string;
  servicoId: string;
  servicoNome: string;
  duracaoMin: number;
  coberto: boolean;
  valorCentavos: number | null;
  confirmado: boolean;
  podeAlterar: boolean;
};

export type AtendimentoPassado = {
  id: string;
  inicioISO: string;
  petNome: string;
  servicoNome: string;
  coberto: boolean;
  valorCentavos: number | null;
  registro: {
    condicoes: string[];
    observacao: string | null;
    midias: { tipo: "foto" | "video"; url: string }[];
  } | null;
};

export type ExtratoTutor = { id: string; competencia: string; totalCentavos: number; pago: boolean };

export type AreaDoTutor = {
  tutorNome: string;
  proximos: ProximoAtendimento[];
  historico: AtendimentoPassado[];
  planos: { petNome: string; planoNome: string; saldo: number; creditosMes: number }[];
  fidelidade: { ativo: boolean; frase: string; disponiveis: number; progresso: number; meta: number; premio: string } | null;
  extratos: ExtratoTutor[];
};

export async function carregarAreaDoTutor(petshopId: string, tutorId: string): Promise<AreaDoTutor | null> {
  const admin = createAdminClient();
  const agora = new Date().toISOString();

  const [dados, { data: futuros }, { data: passados }, { data: fechamentos }, config] = await Promise.all([
    dadosAgendamento(petshopId, tutorId),
    admin
      .from("agendamentos")
      .select("id, inicio, valor_centavos, origem_plano, status, servico_id, pets!inner(nome, tutor_id), servicos(nome, duracao_min)")
      .eq("petshop_id", petshopId)
      .eq("pets.tutor_id", tutorId)
      .in("status", ["agendado", "confirmado"])
      .gte("inicio", agora)
      .order("inicio")
      .limit(10),
    admin
      .from("agendamentos")
      .select("id, inicio, valor_centavos, origem_plano, pets!inner(nome, tutor_id), servicos(nome)")
      .eq("petshop_id", petshopId)
      .eq("pets.tutor_id", tutorId)
      .in("status", ["agendado", "confirmado", "concluido"])
      .lt("inicio", agora)
      .order("inicio", { ascending: false })
      .limit(15),
    admin
      .from("fechamentos")
      .select("id, competencia, total_centavos, status, enviado_em")
      .eq("petshop_id", petshopId)
      .eq("tutor_id", tutorId)
      .order("competencia", { ascending: false })
      .limit(12),
    carregarConfigFidelidade(admin, petshopId),
  ]);
  if (!dados) return null;

  const limiteAlterar = DateTime.now().plus({ hours: ANTECEDENCIA_ALTERAR_HORAS }).toMillis();
  const proximos: ProximoAtendimento[] = (futuros ?? []).flatMap((a) => {
    const pet = um(a.pets as Um<{ nome: string }>);
    const servico = um(a.servicos as Um<{ nome: string; duracao_min: number }>);
    if (!pet || !servico) return [];
    return [
      {
        id: a.id,
        inicioISO: a.inicio,
        petNome: pet.nome,
        servicoId: a.servico_id,
        servicoNome: servico.nome,
        duracaoMin: servico.duracao_min,
        coberto: a.origem_plano,
        valorCentavos: a.valor_centavos,
        confirmado: a.status === "confirmado",
        podeAlterar: new Date(a.inicio).getTime() >= limiteAlterar,
      },
    ];
  });

  // Registros de chegada que o petshop liberou pro tutor.
  const ids = (passados ?? []).map((a) => a.id);
  const [{ data: chegadas }, { data: midias }] = ids.length
    ? await Promise.all([
        admin
          .from("agendamento_chegada")
          .select("agendamento_id, condicoes, observacao")
          .in("agendamento_id", ids)
          .eq("mostrar_tutor", true),
        admin.from("agendamento_midias").select("agendamento_id, caminho, tipo").in("agendamento_id", ids).order("criado_em"),
      ])
    : [{ data: [] }, { data: [] }];
  const liberados = new Map((chegadas ?? []).map((c) => [c.agendamento_id, c]));
  const midiasLiberadas = (midias ?? []).filter((m) => liberados.has(m.agendamento_id));
  const { data: assinadas } = midiasLiberadas.length
    ? await admin.storage.from(BALDE_REGISTROS).createSignedUrls(midiasLiberadas.map((m) => m.caminho), 3600)
    : { data: [] };
  const urlPorCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));

  const historico: AtendimentoPassado[] = (passados ?? []).flatMap((a) => {
    const pet = um(a.pets as Um<{ nome: string }>);
    const servico = um(a.servicos as Um<{ nome: string }>);
    if (!pet || !servico) return [];
    const chegada = liberados.get(a.id);
    return [
      {
        id: a.id,
        inicioISO: a.inicio,
        petNome: pet.nome,
        servicoNome: servico.nome,
        coberto: a.origem_plano,
        valorCentavos: a.valor_centavos,
        registro: chegada
          ? {
              condicoes: chegada.condicoes.map(rotuloCondicao),
              observacao: chegada.observacao,
              midias: midiasLiberadas
                .filter((m) => m.agendamento_id === a.id)
                .flatMap((m) => {
                  const url = urlPorCaminho.get(m.caminho);
                  return url ? [{ tipo: m.tipo as "foto" | "video", url }] : [];
                }),
            }
          : null,
      },
    ];
  });

  const planos: AreaDoTutor["planos"] = [];
  for (const pet of dados.pets) {
    const coberturas = Object.values(dados.coberturas[pet.id] ?? {});
    if (coberturas[0]) {
      planos.push({ petNome: pet.nome, planoNome: coberturas[0].planoNome, saldo: coberturas[0].saldo, creditosMes: coberturas[0].creditosMes });
    }
  }

  let fidelidade: AreaDoTutor["fidelidade"] = null;
  if (config.ativo) {
    const cartao = (await carregarCartoes(admin, petshopId, config, tutorId).catch(() => null))?.get(tutorId);
    fidelidade = {
      ativo: true,
      frase: frasePrograma(config, cartao),
      disponiveis: cartao?.disponiveis ?? 0,
      progresso: cartao?.progresso ?? 0,
      meta: config.meta,
      premio: config.premio,
    };
  }

  return {
    tutorNome: dados.tutorNome,
    proximos,
    historico,
    planos,
    fidelidade,
    // Só o que já foi enviado ou pago: rascunho não aparece pro tutor.
    extratos: (fechamentos ?? [])
      .filter((f) => f.status === "pago" || f.enviado_em)
      .map((f) => ({ id: f.id, competencia: f.competencia, totalCentavos: f.total_centavos, pago: f.status === "pago" })),
  };
}
