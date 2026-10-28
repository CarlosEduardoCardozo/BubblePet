export const CATEGORIAS = [
  { valor: "shampoo", label: "Shampoo" },
  { valor: "condicionador", label: "Condicionador" },
  { valor: "perfume", label: "Perfume / colônia" },
  { valor: "higiene", label: "Higiene e limpeza" },
  { valor: "medicamento", label: "Medicamento" },
  { valor: "racao", label: "Ração" },
  { valor: "petisco", label: "Petisco" },
  { valor: "acessorio", label: "Acessório" },
  { valor: "outro", label: "Outro" },
] as const;
export type Categoria = (typeof CATEGORIAS)[number]["valor"];

export const UNIDADES = [
  { valor: "un", label: "unidades" },
  { valor: "frasco", label: "frascos" },
  { valor: "pacote", label: "pacotes" },
  { valor: "caixa", label: "caixas" },
  { valor: "litro", label: "litros" },
  { valor: "kg", label: "kg" },
] as const;
export type Unidade = (typeof UNIDADES)[number]["valor"];

export const CATEGORIA_VALORES = CATEGORIAS.map((c) => c.valor) as Categoria[];
export const UNIDADE_VALORES = UNIDADES.map((u) => u.valor) as Unidade[];

export function rotuloCategoria(c: string): string {
  return CATEGORIAS.find((x) => x.valor === c)?.label ?? "Outro";
}

export function rotuloUnidade(u: string, quantidade = 2): string {
  const label = UNIDADES.find((x) => x.valor === u)?.label ?? "unidades";
  if (quantidade === 1 && label.endsWith("s")) return label.slice(0, -1);
  return label;
}

/** "3", "2,5" — quantidade sem zeros sobrando. */
export function formatarQuantidade(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0+$/, "").replace(".", ",");
}
