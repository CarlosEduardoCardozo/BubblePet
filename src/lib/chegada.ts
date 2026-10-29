/** Marcas rápidas do registro de chegada do pet. */
export const CONDICOES_CHEGADA = [
  { valor: "machucado", label: "Machucado" },
  { valor: "embolado", label: "Embolado / nós" },
  { valor: "pele", label: "Pele irritada" },
  { valor: "pulgas", label: "Pulgas ou carrapatos" },
  { valor: "sujo", label: "Muito sujo" },
  { valor: "estressado", label: "Agitado ou agressivo" },
  { valor: "outro", label: "Outro" },
] as const;

export const CONDICAO_VALORES: string[] = CONDICOES_CHEGADA.map((c) => c.valor);

export function rotuloCondicao(valor: string): string {
  return CONDICOES_CHEGADA.find((c) => c.valor === valor)?.label ?? valor;
}

export const LIMITE_MIDIA_BYTES = 50 * 1024 * 1024;
export const BALDE_REGISTROS = "registros";
