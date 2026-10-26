import { DateTime } from "luxon";

export const ZONE = "America/Sao_Paulo";

export type RetornoConfig = {
  ativo: boolean;
  dias_antes: number;
  intervalo_padrao_dias: number;
  janela_inicio: string;
  janela_fim: string;
  intervalo_envio_min: number;
  limite_dia: number;
  reenviar_apos_dias: number;
  avisar_plano_sobrando: boolean;
  dias_fim_mes: number;
  planejado_em: string | null;
};

export const CONFIG_PADRAO: RetornoConfig = {
  ativo: false,
  dias_antes: 2,
  intervalo_padrao_dias: 30,
  janela_inicio: "09:00",
  janela_fim: "18:00",
  intervalo_envio_min: 20,
  limite_dia: 15,
  reenviar_apos_dias: 21,
  avisar_plano_sobrando: true,
  dias_fim_mes: 10,
  planejado_em: null,
};

/** Um atendimento que já aconteceu (não cancelado nem falta). */
export type Visita = { inicio: string; servicoNome: string; valorCentavos: number };

export type PetBase = {
  petId: string;
  petNome: string;
  tutorId: string;
  tutorNome: string;
  telefone: string;
  pausado: boolean;
};

/**
 * - `hora_de_voltar`: a data prevista está chegando (ou passou há até 7 dias);
 * - `atrasado`: passou de 7 a 60 dias da data prevista;
 * - `sumido`: mais de 60 dias de atraso (só no painel, não recebe automático);
 * - `em_dia`: ainda não é hora — mostra quando o aviso vai sair;
 * - `agendado`: já tem horário marcado, não precisa de mensagem.
 */
export type Categoria = "hora_de_voltar" | "atrasado" | "sumido" | "em_dia" | "agendado";

export type Retorno = PetBase & {
  categoria: Categoria;
  /** Dias entre as visitas (mediana); estimado = usou o padrão do petshop. */
  intervaloDias: number;
  intervaloEstimado: boolean;
  visitas: number;
  ultimaVisita: string;
  diasDesdeUltima: number;
  /** Data prevista de volta (yyyy-MM-dd). */
  proxima: string;
  /** Negativo = atrasado. */
  diasParaVoltar: number;
  /** Quando o aviso automático sai (yyyy-MM-dd), pra quem ainda está em dia. */
  avisoPrevisto: string;
  servicoNome: string;
  valorCentavos: number;
};

const DIA = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).startOf("day");

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

/**
 * Ritmo de cada pet a partir do histórico. Puro: o painel e a rotina de envio
 * usam a mesma conta.
 */
export function calcularRetornos(input: {
  pets: PetBase[];
  visitasPorPet: Map<string, Visita[]>;
  petsComHorarioFuturo: Set<string>;
  config: RetornoConfig;
  hoje: DateTime;
}): Retorno[] {
  const hoje = input.hoje.setZone(ZONE).startOf("day");
  const lista: Retorno[] = [];

  for (const pet of input.pets) {
    const visitas = [...(input.visitasPorPet.get(pet.petId) ?? [])].sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (visitas.length === 0) continue;

    // Uma visita por dia (dois serviços no mesmo dia contam como uma volta).
    const dias: DateTime[] = [];
    for (const v of visitas) {
      const d = DIA(v.inicio);
      if (!dias.length || !d.hasSame(dias[dias.length - 1], "day")) dias.push(d);
    }
    const diffs = dias.slice(1).map((d, i) => Math.round(d.diff(dias[i], "days").days));
    const estimado = diffs.length === 0;
    const intervalo = estimado
      ? input.config.intervalo_padrao_dias
      : Math.min(120, Math.max(7, mediana(diffs)));

    const ultima = dias[dias.length - 1];
    const ultimaVisita = visitas[visitas.length - 1];
    const proxima = ultima.plus({ days: intervalo });
    const diasParaVoltar = Math.round(proxima.diff(hoje, "days").days);

    let categoria: Categoria;
    if (input.petsComHorarioFuturo.has(pet.petId)) categoria = "agendado";
    else if (diasParaVoltar > input.config.dias_antes) categoria = "em_dia";
    else if (diasParaVoltar >= -7) categoria = "hora_de_voltar";
    else if (diasParaVoltar >= -60) categoria = "atrasado";
    else categoria = "sumido";

    lista.push({
      ...pet,
      categoria,
      intervaloDias: intervalo,
      intervaloEstimado: estimado,
      visitas: dias.length,
      ultimaVisita: ultima.toISODate()!,
      diasDesdeUltima: Math.round(hoje.diff(ultima, "days").days),
      proxima: proxima.toISODate()!,
      diasParaVoltar,
      avisoPrevisto: proxima.minus({ days: input.config.dias_antes }).toISODate()!,
      servicoNome: ultimaVisita.servicoNome,
      valorCentavos: ultimaVisita.valorCentavos,
    });
  }

  return lista;
}

export type PlanoSobrando = PetBase & {
  assinaturaId: string;
  planoNome: string;
  saldo: number;
  creditosMes: number;
};

/** Está nos últimos `dias_fim_mes` dias do mês? (créditos que não acumulam se perdem na virada) */
export function fimDoMes(hoje: DateTime, config: RetornoConfig): boolean {
  const h = hoje.setZone(ZONE);
  return Math.round(h.endOf("month").startOf("day").diff(h.startOf("day"), "days").days) < config.dias_fim_mes;
}

/** Horários da fila do dia: a partir de agora (ou da janela), espaçados, dentro da janela. */
export function horariosDaFila(input: {
  agora: DateTime;
  config: RetornoConfig;
  quantidade: number;
}): DateTime[] {
  const agora = input.agora.setZone(ZONE);
  const [hi, mi] = input.config.janela_inicio.split(":").map(Number);
  const [hf, mf] = input.config.janela_fim.split(":").map(Number);
  const inicio = agora.set({ hour: hi, minute: mi, second: 0, millisecond: 0 });
  const fim = agora.set({ hour: hf, minute: mf, second: 0, millisecond: 0 });
  let t = agora > inicio ? agora.plus({ minutes: 1 }) : inicio;
  const horarios: DateTime[] = [];
  for (let i = 0; i < input.quantidade; i++) {
    // Soma 0–4 min fixos, pra não sair sempre no minuto redondo; o intervalo
    // configurado é o mínimo entre duas mensagens, nunca menos.
    const variacao = (i * 7) % 5;
    const h = t.plus({ minutes: variacao });
    if (h >= fim) break;
    horarios.push(h);
    t = h.plus({ minutes: input.config.intervalo_envio_min });
  }
  return horarios;
}

export function dentroDaJanela(agora: DateTime, config: RetornoConfig): boolean {
  const hhmm = agora.setZone(ZONE).toFormat("HH:mm");
  return hhmm >= config.janela_inicio.slice(0, 5) && hhmm < config.janela_fim.slice(0, 5);
}
