import { formatCentavos } from "@/lib/currency";

export type Porte = "pequeno" | "medio" | "grande";

export const PORTES: { valor: Porte; label: string; curto: string }[] = [
  { valor: "pequeno", label: "Pequeno", curto: "P" },
  { valor: "medio", label: "Médio", curto: "M" },
  { valor: "grande", label: "Grande", curto: "G" },
];

export type PrecosServico = {
  preco_centavos: number;
  preco_pequeno_centavos?: number | null;
  preco_medio_centavos?: number | null;
  preco_grande_centavos?: number | null;
};

/** Preço do serviço pro porte do pet; sem preço específico, vale o padrão. */
export function precoParaPorte(servico: PrecosServico, porte: string | null | undefined): number {
  const especifico =
    porte === "pequeno"
      ? servico.preco_pequeno_centavos
      : porte === "medio"
        ? servico.preco_medio_centavos
        : porte === "grande"
          ? servico.preco_grande_centavos
          : null;
  return especifico ?? servico.preco_centavos;
}

export function temPrecoPorPorte(servico: PrecosServico): boolean {
  return (
    servico.preco_pequeno_centavos != null ||
    servico.preco_medio_centavos != null ||
    servico.preco_grande_centavos != null
  );
}

/** "P R$ 50,00 · M R$ 60,00 · G R$ 80,00" (só os portes com preço próprio). */
export function resumoPrecos(servico: PrecosServico): string {
  if (!temPrecoPorPorte(servico)) return formatCentavos(servico.preco_centavos);
  return PORTES.map((p) => `${p.curto} ${formatCentavos(precoParaPorte(servico, p.valor))}`).join(" · ");
}
