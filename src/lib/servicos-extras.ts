import { z } from "zod";

/**
 * Serviço a mais no mesmo agendamento (ex.: Banho + Hidratação). Soma a
 * duração no horário e o valor no total; quando o plano do pet tem crédito
 * daquele serviço, usa o crédito e sai sem custo (assinaturaId preenchido).
 */
export type ServicoExtra = {
  servicoId: string;
  nome: string;
  duracaoMin: number;
  valorCentavos: number;
  assinaturaId: string | null;
  planoNome: string | null;
};

/** Como fica no banco (agendamentos.servicos_extras). */
type ServicoExtraDb = {
  servico_id: string;
  nome: string;
  duracao_min: number;
  valor_centavos: number;
  assinatura_id: string | null;
  plano_nome: string | null;
};

export function paraBanco(extras: ServicoExtra[]): ServicoExtraDb[] {
  return extras.map((e) => ({
    servico_id: e.servicoId,
    nome: e.nome,
    duracao_min: e.duracaoMin,
    valor_centavos: e.valorCentavos,
    assinatura_id: e.assinaturaId,
    plano_nome: e.planoNome,
  }));
}

export function doBanco(raw: unknown): ServicoExtra[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const e = r as Partial<ServicoExtraDb>;
    if (!e || typeof e.servico_id !== "string") return [];
    return [
      {
        servicoId: e.servico_id,
        nome: e.nome ?? "",
        duracaoMin: Number(e.duracao_min) || 0,
        valorCentavos: Number(e.valor_centavos) || 0,
        assinaturaId: e.assinatura_id ?? null,
        planoNome: e.plano_nome ?? null,
      },
    ];
  });
}

/** O que o formulário manda: o servidor busca nome, duração e confere o crédito. */
export type ServicoExtraPedido = { servicoId: string; valorCentavos: number | null; usarPlano: boolean };

const pedidoSchema = z
  .array(
    z.object({
      servicoId: z.string().trim().min(1, "Escolha o serviço"),
      valorCentavos: z.number().int().min(0, "Valor inválido").max(10_000_00, "Valor inválido").nullable(),
      usarPlano: z.boolean(),
    })
  )
  .max(10, "No máximo 10 serviços por agendamento");

export function lerPedidosExtras(
  raw: unknown
): { ok: true; pedidos: ServicoExtraPedido[] } | { ok: false; erro: string } {
  let valor: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { ok: true, pedidos: [] };
    try {
      valor = JSON.parse(raw);
    } catch {
      return { ok: false, erro: "Serviços inválidos" };
    }
  }
  if (valor == null) return { ok: true, pedidos: [] };
  const parsed = pedidoSchema.safeParse(valor);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0]?.message ?? "Serviços inválidos" };
  const ids = parsed.data.map((p) => p.servicoId);
  if (new Set(ids).size !== ids.length) return { ok: false, erro: "O mesmo serviço apareceu duas vezes." };
  return { ok: true, pedidos: parsed.data };
}

export function somaServicosExtras(extras: ServicoExtra[] | null | undefined): number {
  return (extras ?? []).reduce((s, e) => s + e.valorCentavos, 0);
}

export function duracaoServicosExtras(extras: { duracaoMin: number }[] | null | undefined): number {
  return (extras ?? []).reduce((s, e) => s + e.duracaoMin, 0);
}
