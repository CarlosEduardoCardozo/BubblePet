import { DateTime } from "luxon";
import { nomeFeriado } from "@/lib/feriados-br";

export const ZONE = "America/Sao_Paulo";

export type Ocupado = { id?: string; inicio: string; fim: string };

/** Expediente de um dia: "08:00"–"18:00", com pausa opcional (almoço). */
export type HorarioDia = {
  abertura: string;
  fechamento: string;
  pausaInicio?: string | null;
  pausaFim?: string | null;
};

/** Chave = dia ISO (1=segunda ... 7=domingo); dia ausente = fechado. */
export type HorarioSemana = Partial<Record<number, HorarioDia>>;

export type HorarioFuncionamento = {
  /** Menor abertura da semana, "08:00" (limites da grade da agenda). */
  abertura: string;
  /** Maior fechamento da semana, "18:00". */
  fechamento: string;
  /** Dias abertos, 1=segunda ... 7=domingo (ISO/luxon). */
  dias: number[];
  /** Horário de cada dia; sem ele, todo dia aberto usa abertura/fechamento. */
  semana?: HorarioSemana;
  /** Quantos atendimentos cabem ao mesmo tempo (padrão 1). */
  capacidade?: number;
};

export const HORARIO_PADRAO: HorarioFuncionamento = {
  abertura: "08:00",
  fechamento: "18:00",
  dias: [1, 2, 3, 4, 5, 6],
};

function hm(valor: string): { hour: number; minute: number } {
  const [h, m] = valor.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lê o jsonb do banco; ignora dia malformado em vez de quebrar a agenda. */
export function lerHorarioSemana(raw: unknown): HorarioSemana | null {
  if (!raw || typeof raw !== "object") return null;
  const semana: HorarioSemana = {};
  for (const [chave, valor] of Object.entries(raw as Record<string, unknown>)) {
    const dia = Number(chave);
    if (!Number.isInteger(dia) || dia < 1 || dia > 7 || !valor || typeof valor !== "object") continue;
    const v = valor as Record<string, unknown>;
    if (typeof v.abertura !== "string" || typeof v.fechamento !== "string") continue;
    if (!HORA_RE.test(v.abertura) || !HORA_RE.test(v.fechamento) || v.abertura >= v.fechamento) continue;
    const temPausa =
      typeof v.pausaInicio === "string" &&
      typeof v.pausaFim === "string" &&
      HORA_RE.test(v.pausaInicio) &&
      HORA_RE.test(v.pausaFim) &&
      v.pausaInicio < v.pausaFim;
    semana[dia] = {
      abertura: v.abertura,
      fechamento: v.fechamento,
      ...(temPausa ? { pausaInicio: v.pausaInicio as string, pausaFim: v.pausaFim as string } : {}),
    };
  }
  return semana;
}

/** Monta o horário a partir da linha de petshops (mesma regra em todo lugar). */
export function horarioDoPetshop(row: {
  horario_abertura?: string | null;
  horario_fechamento?: string | null;
  dias_funcionamento?: number[] | null;
  horario_semana?: unknown;
  capacidade_por_horario?: number | null;
} | null): HorarioFuncionamento {
  if (!row) return HORARIO_PADRAO;
  const abertura = row.horario_abertura ? String(row.horario_abertura).slice(0, 5) : HORARIO_PADRAO.abertura;
  const fechamento = row.horario_fechamento ? String(row.horario_fechamento).slice(0, 5) : HORARIO_PADRAO.fechamento;
  const semana = lerHorarioSemana(row.horario_semana);
  if (semana) {
    const dias = Object.keys(semana).map(Number).sort();
    const abre = dias.map((d) => semana[d]!.abertura).sort()[0] ?? abertura;
    const fecha = dias.map((d) => semana[d]!.fechamento).sort().at(-1) ?? fechamento;
    return { abertura: abre, fechamento: fecha, dias, semana, capacidade: row.capacidade_por_horario ?? 1 };
  }
  return {
    abertura,
    fechamento,
    dias: row.dias_funcionamento ?? HORARIO_PADRAO.dias,
    capacidade: row.capacidade_por_horario ?? 1,
  };
}

/** Expediente do dia da semana (1..7), ou null se fecha. */
export function horarioDoDia(horario: HorarioFuncionamento, weekday: number): HorarioDia | null {
  if (horario.semana) return horario.semana[weekday] ?? null;
  return horario.dias.includes(weekday)
    ? { abertura: horario.abertura, fechamento: horario.fechamento }
    : null;
}

export function diaAberto(dataISO: string, horario: HorarioFuncionamento): boolean {
  const dia = DateTime.fromISO(dataISO, { zone: ZONE });
  if (!dia.isValid) return false;
  if (!horarioDoDia(horario, dia.weekday)) return false;
  if (nomeFeriado(dia.toFormat("yyyy-LL-dd"))) return false;
  return true;
}

type Intervalo = { inicio: DateTime; fim: DateTime };

/**
 * Cabe mais um atendimento em [inicio, fim)? Conta quantos acontecem ao mesmo
 * tempo (não só quantos se sobrepõem) — mesma regra do trigger
 * checar_capacidade_agenda no banco.
 */
function cabe(inicio: DateTime, fim: DateTime, intervalos: Intervalo[], capacidade: number): boolean {
  const sobrepostos = intervalos.filter((o) => inicio < o.fim && fim > o.inicio);
  if (sobrepostos.length < capacidade) return true;
  const pontos = [inicio, ...sobrepostos.filter((o) => o.inicio > inicio).map((o) => o.inicio)];
  const maximo = Math.max(
    ...pontos.map((t) => sobrepostos.filter((o) => o.inicio <= t && o.fim > t).length)
  );
  return maximo + 1 <= capacidade;
}

export function horarioCabe(
  inicio: DateTime,
  duracaoMin: number,
  ocupados: Ocupado[],
  capacidade = 1
): boolean {
  const intervalos = ocupados.map((o) => ({
    inicio: DateTime.fromISO(o.inicio),
    fim: DateTime.fromISO(o.fim),
  }));
  return cabe(inicio, inicio.plus({ minutes: duracaoMin }), intervalos, Math.max(1, capacidade));
}

/**
 * Horários de início livres num dia, em passos de `stepMin`, que cabem no
 * expediente daquele dia (sem atravessar a pausa), respeitam a capacidade do
 * horário e a antecedência mínima em relação a `agora`. Puro: mesma função pro painel da agenda e pro
 * link público.
 */
export function calcularHorariosLivres(opts: {
  dataISO: string;
  duracaoMin: number;
  ocupados: Ocupado[];
  horario: HorarioFuncionamento;
  agora?: DateTime;
  stepMin?: number;
  antecedenciaMin?: number;
}): DateTime[] {
  const { dataISO, duracaoMin, ocupados, horario } = opts;
  const stepMin = opts.stepMin ?? 30;
  const antecedenciaMin = opts.antecedenciaMin ?? 60;
  const agora = (opts.agora ?? DateTime.now()).setZone(ZONE);

  if (!diaAberto(dataISO, horario)) return [];

  const dia = DateTime.fromISO(dataISO, { zone: ZONE }).startOf("day");
  const expediente = horarioDoDia(horario, dia.weekday)!;
  const abertura = dia.set(hm(expediente.abertura));
  const fechamento = dia.set(hm(expediente.fechamento));
  const pausa =
    expediente.pausaInicio && expediente.pausaFim
      ? { inicio: dia.set(hm(expediente.pausaInicio)), fim: dia.set(hm(expediente.pausaFim)) }
      : null;
  const minimo = agora.plus({ minutes: antecedenciaMin });
  const capacidade = Math.max(1, horario.capacidade ?? 1);

  const intervalos = ocupados.map((o) => ({
    inicio: DateTime.fromISO(o.inicio).setZone(ZONE),
    fim: DateTime.fromISO(o.fim).setZone(ZONE),
  }));

  const livres: DateTime[] = [];
  for (
    let inicio = abertura;
    inicio.plus({ minutes: duracaoMin }) <= fechamento;
    inicio = inicio.plus({ minutes: stepMin })
  ) {
    if (inicio < minimo) continue;
    const fim = inicio.plus({ minutes: duracaoMin });
    // Atendimento não atravessa o almoço.
    if (pausa && inicio < pausa.fim && fim > pausa.inicio) continue;
    if (cabe(inicio, fim, intervalos, capacidade)) livres.push(inicio);
  }
  return livres;
}

/** Próximos N dias abertos a partir de hoje (inclusive), como ISO date. */
export function proximosDiasAbertos(
  horario: HorarioFuncionamento,
  quantidade: number,
  agora: DateTime = DateTime.now()
): string[] {
  const dias: string[] = [];
  let cursor = agora.setZone(ZONE).startOf("day");
  for (let i = 0; i < 60 && dias.length < quantidade; i++) {
    const iso = cursor.toISODate()!;
    if (diaAberto(iso, horario)) dias.push(iso);
    cursor = cursor.plus({ days: 1 });
  }
  return dias;
}
