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

export type GrupoServico = {
  nome: string;
  datas: DataBanho[];
  quantidade: number;
  subtotalCentavos: number;
  /** Preço por banho quando todos os avulsos custaram o mesmo; senão null. */
  valorUnitarioCentavos: number | null;
  cobertos: number;
  adicionaisCentavos: number;
};

export type GrupoPet = {
  petNome: string;
  servicos: GrupoServico[];
  mensalidades: { descricao: string; valorCentavos: number }[];
};

export type ResumoFechamento = {
  pets: GrupoPet[];
  totalBanhos: number;
  totalCentavos: number;
  totalAdicionaisCentavos: number;
  /** Primeira e última data de banho ("26/08" … "15/09"), se houver. */
  periodo: { inicio: string; fim: string; inicioISO: string; fimISO: string } | null;
};

/**
 * Agrupa os itens de um extrato por pet e por serviço, com as datas de cada
 * banho — o formato que o petshop já manda hoje ("Banhos 04/08, 25/08…
 * Foram 3 banhos, total R$ 120"). Usado na mensagem e no PDF.
 */
export function resumirFechamento(itens: ItemFechamento[]): ResumoFechamento {
  const pets = new Map<string, GrupoPet>();
  const pet = (nome: string) => {
    let g = pets.get(nome);
    if (!g) {
      g = { petNome: nome, servicos: [], mensalidades: [] };
      pets.set(nome, g);
    }
    return g;
  };

  const servicosOrdenados = itens
    .filter((i) => i.tipo === "servico" && i.data)
    .sort((a, b) => a.data!.localeCompare(b.data!));

  const porAgendamento = new Map<string, { data: DataBanho; grupo: GrupoServico }>();
  for (const i of servicosOrdenados) {
    const g = pet(i.petNome);
    let s = g.servicos.find((x) => x.nome === i.descricao);
    if (!s) {
      s = {
        nome: i.descricao,
        datas: [],
        quantidade: 0,
        subtotalCentavos: 0,
        valorUnitarioCentavos: null,
        cobertos: 0,
        adicionaisCentavos: 0,
      };
      g.servicos.push(s);
    }
    const dt = DateTime.fromISO(i.data!).setZone(ZONE).setLocale("pt-BR");
    const data: DataBanho = {
      data: dt.toFormat("dd/LL"),
      diaSemana: dt.toFormat("ccc").replace(".", ""),
      coberto: !!i.cobertoPlano,
      valorCentavos: i.valorCentavos,
      adicionais: [],
    };
    s.datas.push(data);
    if (i.agendamentoId) porAgendamento.set(i.agendamentoId, { data, grupo: s });
    s.quantidade += 1;
    s.subtotalCentavos += i.valorCentavos;
    if (i.cobertoPlano) s.cobertos += 1;
  }

  let totalAdicionais = 0;
  for (const i of itens.filter((x) => x.tipo === "adicional")) {
    totalAdicionais += i.valorCentavos;
    const alvo = i.agendamentoId ? porAgendamento.get(i.agendamentoId) : undefined;
    if (alvo) {
      alvo.data.adicionais.push({ descricao: i.descricao, valorCentavos: i.valorCentavos });
      alvo.grupo.adicionaisCentavos += i.valorCentavos;
    } else {
      pet(i.petNome).mensalidades.push({ descricao: i.descricao, valorCentavos: i.valorCentavos });
    }
  }

  for (const g of pets.values()) {
    for (const s of g.servicos) {
      const avulsos = s.datas.filter((d) => !d.coberto).map((d) => d.valorCentavos);
      s.valorUnitarioCentavos =
        avulsos.length > 0 && avulsos.every((v) => v === avulsos[0]) ? avulsos[0] : null;
    }
  }

  for (const i of itens.filter((x) => x.tipo === "mensalidade")) {
    pet(i.petNome).mensalidades.push({ descricao: i.descricao, valorCentavos: i.valorCentavos });
  }

  const primeiro = servicosOrdenados[0]?.data;
  const ultimo = servicosOrdenados[servicosOrdenados.length - 1]?.data;
  const fmt = (iso: string) => DateTime.fromISO(iso).setZone(ZONE).toFormat("dd/LL");

  return {
    pets: Array.from(pets.values()),
    totalBanhos: servicosOrdenados.length,
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
