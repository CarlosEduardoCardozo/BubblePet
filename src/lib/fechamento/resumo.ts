import { DateTime } from "luxon";
import type { ItemFechamento } from "./calcular";

const ZONE = "America/Sao_Paulo";

export type DataBanho = {
  /** "26/08" */
  data: string;
  /** "qua" */
  diaSemana: string;
  coberto: boolean;
  valorCentavos: number;
  /** Extras do mesmo atendimento (desembolo...). */
  adicionais: { descricao: string; valorCentavos: number }[];
};

/** Plano do pet no extrato: a mensalidade e os banhos que ele cobriu. */
export type GrupoPlano = {
  nome: string;
  /** Mensalidade cobrada neste extrato (null se já foi cobrada em outro). */
  mensalidade: { descricao: string; valorCentavos: number } | null;
  creditosMes: number | null;
  servicoNome: string | null;
  banhos: DataBanho[];
  adicionaisCentavos: number;
};

/** Atendimentos cobrados à parte, por serviço. */
export type GrupoServico = {
  nome: string;
  datas: DataBanho[];
  quantidade: number;
  subtotalCentavos: number;
  /** Preço por banho quando todos custaram o mesmo; senão null. */
  valorUnitarioCentavos: number | null;
  adicionaisCentavos: number;
  /** O pet tem plano desse serviço: são banhos a mais, além do plano. */
  alemDoPlano: boolean;
};

export type GrupoPet = {
  petNome: string;
  planos: GrupoPlano[];
  servicos: GrupoServico[];
  /** Itens soltos (extra sem atendimento, formato antigo). */
  outros: { descricao: string; valorCentavos: number }[];
};

export type ResumoFechamento = {
  pets: GrupoPet[];
  totalBanhos: number;
  banhosPlano: number;
  banhosAvulsos: number;
  totalCentavos: number;
  totalAdicionaisCentavos: number;
  /** Primeira e última data de banho ("26/08" … "15/09"), se houver. */
  periodo: { inicio: string; fim: string; inicioISO: string; fimISO: string } | null;
};

/** Extratos antigos não guardavam o plano no item: tira do texto. */
function nomeDoPlano(item: ItemFechamento): string {
  if (item.planoNome) return item.planoNome;
  if (item.tipo === "mensalidade") {
    if (item.descricao.startsWith("Mensalidade — ")) return item.descricao.slice("Mensalidade — ".length);
    return item.descricao.split(" — ")[0] ?? "Plano";
  }
  return "Plano";
}

/**
 * Organiza o extrato por pet: cada plano com a mensalidade e as datas dos
 * banhos que ele cobriu, e depois os banhos cobrados à parte (marcados como
 * "a mais" quando o pet tem plano daquele serviço). Um extrato só, explicando
 * tudo. Usado na mensagem e no PDF.
 */
export function resumirFechamento(itens: ItemFechamento[]): ResumoFechamento {
  const pets = new Map<string, GrupoPet>();
  const pet = (nome: string) => {
    let g = pets.get(nome);
    if (!g) {
      g = { petNome: nome, planos: [], servicos: [], outros: [] };
      pets.set(nome, g);
    }
    return g;
  };
  const plano = (g: GrupoPet, nome: string) => {
    let p = g.planos.find((x) => x.nome === nome);
    if (!p) {
      p = { nome, mensalidade: null, creditosMes: null, servicoNome: null, banhos: [], adicionaisCentavos: 0 };
      g.planos.push(p);
    }
    return p;
  };

  // Mensalidades primeiro: definem o plano (e o serviço dele) de cada pet.
  for (const i of itens.filter((x) => x.tipo === "mensalidade")) {
    const p = plano(pet(i.petNome), nomeDoPlano(i));
    p.mensalidade = { descricao: i.descricao, valorCentavos: i.valorCentavos };
    p.creditosMes = i.creditosMes ?? p.creditosMes;
    p.servicoNome = i.servicoNome ?? p.servicoNome;
  }

  const servicosOrdenados = itens
    .filter((i) => i.tipo === "servico" && i.data)
    .sort((a, b) => a.data!.localeCompare(b.data!));

  const porAgendamento = new Map<string, { data: DataBanho; grupo: { adicionaisCentavos: number } }>();
  for (const i of servicosOrdenados) {
    const g = pet(i.petNome);
    const dt = DateTime.fromISO(i.data!).setZone(ZONE).setLocale("pt-BR");
    const data: DataBanho = {
      data: dt.toFormat("dd/LL"),
      diaSemana: dt.toFormat("ccc").replace(".", ""),
      coberto: !!i.cobertoPlano,
      valorCentavos: i.valorCentavos,
      adicionais: [],
    };

    if (i.cobertoPlano) {
      const p = plano(g, nomeDoPlano(i));
      p.banhos.push(data);
      p.creditosMes = p.creditosMes ?? i.creditosMes ?? null;
      p.servicoNome = p.servicoNome ?? i.descricao;
      if (i.agendamentoId) porAgendamento.set(i.agendamentoId, { data, grupo: p });
      continue;
    }

    let s = g.servicos.find((x) => x.nome === i.descricao);
    if (!s) {
      s = {
        nome: i.descricao,
        datas: [],
        quantidade: 0,
        subtotalCentavos: 0,
        valorUnitarioCentavos: null,
        adicionaisCentavos: 0,
        alemDoPlano: false,
      };
      g.servicos.push(s);
    }
    s.datas.push(data);
    s.quantidade += 1;
    s.subtotalCentavos += i.valorCentavos;
    if (i.agendamentoId) porAgendamento.set(i.agendamentoId, { data, grupo: s });
  }

  let totalAdicionais = 0;
  for (const i of itens.filter((x) => x.tipo === "adicional")) {
    totalAdicionais += i.valorCentavos;
    const alvo = i.agendamentoId ? porAgendamento.get(i.agendamentoId) : undefined;
    if (alvo) {
      alvo.data.adicionais.push({ descricao: i.descricao, valorCentavos: i.valorCentavos });
      alvo.grupo.adicionaisCentavos += i.valorCentavos;
    } else {
      pet(i.petNome).outros.push({ descricao: i.descricao, valorCentavos: i.valorCentavos });
    }
  }

  for (const g of pets.values()) {
    for (const s of g.servicos) {
      const valores = s.datas.map((d) => d.valorCentavos);
      s.valorUnitarioCentavos =
        valores.length > 0 && valores.every((v) => v === valores[0]) ? valores[0] : null;
      s.alemDoPlano = g.planos.some(
        (p) => p.servicoNome != null && p.servicoNome.toLowerCase() === s.nome.toLowerCase()
      );
    }
  }

  const banhosPlano = Array.from(pets.values()).reduce(
    (n, g) => n + g.planos.reduce((m, p) => m + p.banhos.length, 0),
    0
  );
  const primeiro = servicosOrdenados[0]?.data;
  const ultimo = servicosOrdenados[servicosOrdenados.length - 1]?.data;
  const fmt = (iso: string) => DateTime.fromISO(iso).setZone(ZONE).toFormat("dd/LL");

  return {
    pets: Array.from(pets.values()),
    totalBanhos: servicosOrdenados.length,
    banhosPlano,
    banhosAvulsos: servicosOrdenados.length - banhosPlano,
    totalCentavos: itens.reduce((s, i) => s + i.valorCentavos, 0),
    totalAdicionaisCentavos: totalAdicionais,
    periodo:
      primeiro && ultimo
        ? {
            inicio: fmt(primeiro),
            fim: fmt(ultimo),
            inicioISO: DateTime.fromISO(primeiro).setZone(ZONE).toISODate()!,
            fimISO: DateTime.fromISO(ultimo).setZone(ZONE).toISODate()!,
          }
        : null,
  };
}
