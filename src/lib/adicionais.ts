import { z } from "zod";

/** Extra cobrado num atendimento (desembolo, procedimento diferente...). */
export type Adicional = { descricao: string; valorCentavos: number };

const schema = z
  .array(
    z.object({
      descricao: z.string().trim().min(1, "Descreva o adicional").max(80),
      valorCentavos: z.number().int().min(0).max(10_000_00),
    })
  )
  .max(10, "No máximo 10 adicionais por atendimento");

/** Valida o JSON vindo do formulário. Nunca confia no cliente. */
export function lerAdicionais(raw: unknown): { ok: true; adicionais: Adicional[] } | { ok: false; erro: string } {
  let valor: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { ok: true, adicionais: [] };
    try {
      valor = JSON.parse(raw);
    } catch {
      return { ok: false, erro: "Adicionais inválidos" };
    }
  }
  if (valor == null) return { ok: true, adicionais: [] };
  const parsed = schema.safeParse(valor);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0]?.message ?? "Adicionais inválidos" };
  return { ok: true, adicionais: parsed.data };
}

export function somaAdicionais(adicionais: Adicional[] | null | undefined): number {
  return (adicionais ?? []).reduce((s, a) => s + a.valorCentavos, 0);
}

/** Sugestões comuns; os nomes dos serviços cadastrados também entram. */
export const SUGESTOES_ADICIONAIS = [
  "Desembolo",
  "Hidratação",
  "Corte de unhas",
  "Limpeza de ouvido",
  "Tosa higiênica",
  "Taxa de busca e entrega",
];
