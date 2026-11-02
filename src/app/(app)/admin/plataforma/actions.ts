"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAdminAcao } from "@/lib/admin-acesso";
import { normalizePhoneBR } from "@/lib/phone";
import { statusDaPlataforma, type StatusPlataforma } from "@/lib/plataforma";

type Resultado = { error: string } | { success: true };

const schema = z.object({
  linkAssinatura: z.string().trim().max(500),
  precoReais: z.string().trim().max(20),
  contatoWhatsapp: z.string().trim().max(30),
  disparoUrl: z.string().trim().max(300),
  /** Em branco = manter o token já salvo. */
  disparoToken: z.string().trim().max(300),
  disparoPorHora: z.number().int().min(1, "O mínimo é 1 por hora.").max(72, "O máximo é 72 por hora."),
});
export type PlataformaForm = z.input<typeof schema>;

function urlValida(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function salvarPlataforma(form: PlataformaForm): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const p = schema.safeParse(form);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;

  if (d.linkAssinatura && !urlValida(d.linkAssinatura)) return { error: "O link de pagamento precisa começar com https://" };
  if (d.disparoUrl && !urlValida(d.disparoUrl)) return { error: "O endereço do servidor precisa começar com https://" };

  let preco: number | null = null;
  if (d.precoReais) {
    const n = Number(d.precoReais.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return { error: "Preço inválido. Use algo como 180 ou 179,90." };
    preco = Math.round(n * 100);
  }
  let contato: string | null = null;
  if (d.contatoWhatsapp) {
    contato = normalizePhoneBR(d.contatoWhatsapp);
    if (!contato) return { error: "WhatsApp de contato inválido. Use DDD + número." };
  }

  const campos: Record<string, unknown> = {
    id: 1,
    link_assinatura: d.linkAssinatura || null,
    preco_mensal_centavos: preco,
    contato_whatsapp: contato,
    disparo_url: d.disparoUrl ? d.disparoUrl.replace(/\/$/, "") : null,
    disparo_por_hora: d.disparoPorHora,
    atualizado_em: new Date().toISOString(),
  };
  // O token só muda quando um novo é digitado; apagar o servidor limpa o token também.
  if (d.disparoToken) campos.disparo_token = d.disparoToken;
  if (!d.disparoUrl) campos.disparo_token = null;

  const { error } = await createAdminClient().from("plataforma_config").upsert(campos);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/admin/plataforma");
  revalidatePath("/assinar");
  return { success: true };
}

/** Confere na UAZAPI se o servidor e o token salvos funcionam e se o número está conectado. */
export async function testarPlataforma(): Promise<StatusPlataforma | { error: string }> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  return statusDaPlataforma();
}
