import { DateTime } from "luxon";

// Regras do financeiro: como um recebimento vira lançamentos (taxa, prazo,
// parcelas). Funções puras, sem acesso a banco, pra serem fáceis de testar.

const ZONE = "America/Sao_Paulo";

export type MetodoParaCalculo = {
  prazo_dias: number;
  parcelado_modo: "parcela_a_parcela" | "tudo_junto";
  taxa_fixa_tipo: "reais" | "percentual" | null;
  taxa_fixa_valor: number | null;
  taxas: { parcelas: number; percentual: number }[];
};

export type LancamentoCalculado = {
  parcela_numero: number;
  parcelas_total: number;
  valor_bruto_centavos: number;
  taxa_centavos: number;
  data_prevista: string;
};

/** Hoje em America/Sao_Paulo (yyyy-MM-dd). */
export function hojeISO(): string {
  return DateTime.now().setZone(ZONE).toISODate()!;
}

/** Divide `total` em `n` partes inteiras; as primeiras levam os centavos que sobram. */
export function dividirCentavos(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/**
 * Taxa total de um recebimento em `parcelas` vezes: percentual da tabela de
 * parcelamento mais a taxa fixa (R$ ou %) por parcela.
 */
export function calcularTaxaTotal(bruto: number, parcelas: number, metodo: MetodoParaCalculo): number {
  const pct = metodo.taxas.find((t) => t.parcelas === parcelas)?.percentual ?? 0;
  let taxa = Math.round((bruto * pct) / 100);

  if (metodo.taxa_fixa_tipo && metodo.taxa_fixa_valor !== null) {
    taxa +=
      metodo.taxa_fixa_tipo === "reais"
        ? Math.round(metodo.taxa_fixa_valor * 100) * parcelas
        : Math.round((bruto * metodo.taxa_fixa_valor) / 100);
  }
  // A taxa nunca passa do valor cobrado (o banco também exige).
  return Math.min(taxa, bruto);
}

/**
 * Transforma uma venda em lançamentos: desconta a taxa e define quando cada
 * parcela cai. Parcela a parcela: a 1ª cai no prazo do método e as seguintes
 * mês a mês. Tudo junto: um lançamento só, no prazo do método.
 */
export function calcularEntrada(
  bruto: number,
  parcelas: number,
  metodo: MetodoParaCalculo,
  dataVenda: string
): LancamentoCalculado[] {
  const taxaTotal = calcularTaxaTotal(bruto, parcelas, metodo);
  const primeira = DateTime.fromISO(dataVenda, { zone: ZONE }).plus({ days: metodo.prazo_dias });

  if (parcelas === 1 || metodo.parcelado_modo === "tudo_junto") {
    return [
      {
        parcela_numero: 1,
        parcelas_total: 1,
        valor_bruto_centavos: bruto,
        taxa_centavos: taxaTotal,
        data_prevista: primeira.toISODate()!,
      },
    ];
  }

  const brutos = dividirCentavos(bruto, parcelas);
  const taxas = dividirCentavos(taxaTotal, parcelas);
  return brutos.map((valor, i) => ({
    parcela_numero: i + 1,
    parcelas_total: parcelas,
    valor_bruto_centavos: valor,
    // A taxa de uma parcela pequena não pode passar do valor dela.
    taxa_centavos: Math.min(taxas[i], valor),
    data_prevista: primeira.plus({ months: i }).toISODate()!,
  }));
}

export type StatusLancamento = "previsto" | "realizado" | "cancelado";

/** Mês (1º dia) de uma data yyyy-MM-dd. */
export function competenciaDaData(data: string): string {
  return DateTime.fromISO(data, { zone: ZONE }).startOf("month").toISODate()!;
}
