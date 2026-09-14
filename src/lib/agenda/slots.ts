import { DateTime } from "luxon";
import { nomeFeriado } from "@/lib/feriados-br";

export const ZONE = "America/Sao_Paulo";

export type Ocupado = { id?: string; inicio: string; fim: string };

export type HorarioFuncionamento = {
  /** "08:00" */
  abertura: string;
  /** "18:00" */
  fechamento: string;
  /** 1=segunda ... 7=domingo (ISO/luxon) */
  dias: number[];
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

export function diaAberto(dataISO: string, horario: HorarioFuncionamento): boolean {
  const dia = DateTime.fromISO(dataISO, { zone: ZONE });
  if (!dia.isValid) return false;
  if (!horario.dias.includes(dia.weekday)) return false;
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
 * Horários de início livres num dia, em passos de `stepMin`, que cabem antes
 * do fechamento, respeitam a capacidade do horário e respeitam a antecedência
 * mínima em relação a `agora`. Puro: mesma função pro painel da agenda e pro
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
  const abertura = dia.set(hm(horario.abertura));
  const fechamento = dia.set(hm(horario.fechamento));
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
