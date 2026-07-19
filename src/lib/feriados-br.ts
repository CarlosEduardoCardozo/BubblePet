const FERIADOS_FIXOS: { mes: number; dia: number; nome: string }[] = [
  { mes: 1, dia: 1, nome: "Confraternização Universal" },
  { mes: 4, dia: 21, nome: "Tiradentes" },
  { mes: 5, dia: 1, nome: "Dia do Trabalho" },
  { mes: 9, dia: 7, nome: "Independência do Brasil" },
  { mes: 10, dia: 12, nome: "Nossa Senhora Aparecida" },
  { mes: 11, dia: 2, nome: "Finados" },
  { mes: 11, dia: 15, nome: "Proclamação da República" },
  { mes: 11, dia: 20, nome: "Dia da Consciência Negra" },
  { mes: 12, dia: 25, nome: "Natal" },
];

function chave(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Domingo de Páscoa (algoritmo de Gauss/Meeus, calendário gregoriano). */
function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(data: Date, dias: number): Date {
  const nova = new Date(data);
  nova.setUTCDate(nova.getUTCDate() + dias);
  return nova;
}

function chaveDeData(data: Date): string {
  return chave(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());
}

/** Feriados nacionais (fixos + móveis a partir da Páscoa) de um ano civil. */
export function feriadosDoAno(ano: number): Map<string, string> {
  const mapa = new Map<string, string>();

  for (const f of FERIADOS_FIXOS) {
    mapa.set(chave(ano, f.mes, f.dia), f.nome);
  }

  const pascoa = calcularPascoa(ano);
  mapa.set(chaveDeData(somarDias(pascoa, -47)), "Carnaval");
  mapa.set(chaveDeData(somarDias(pascoa, -2)), "Sexta-feira Santa");
  mapa.set(chaveDeData(somarDias(pascoa, 60)), "Corpus Christi");

  return mapa;
}

/** Nome do feriado numa data ISO ("yyyy-LL-dd"), ou null se não for feriado. */
export function nomeFeriado(dataISO: string): string | null {
  const ano = Number(dataISO.slice(0, 4));
  return feriadosDoAno(ano).get(dataISO) ?? null;
}
