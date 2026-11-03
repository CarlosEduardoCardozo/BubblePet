"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneBR } from "@/lib/phone";

export type LeadState = { error?: string; ok?: boolean } | undefined;

const schema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome.").max(80),
  petshop: z.string().trim().max(80),
  telefone: z.string().trim().min(1, "Informe o seu WhatsApp."),
});

const MAX_POR_IP_HORA = 5;

/**
 * Formulário da landing page: "deixe seu WhatsApp que a gente chama". Vira
 * lead no CRM (origem "landing"). Sem conta e sem login, então tem trava
 * contra robô (campo escondido) e contra enxurrada (limite por aparelho).
 */
export async function registrarLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  if (String(formData.get("site") ?? "").trim()) return { ok: true }; // robô: finge que deu certo

  const p = schema.safeParse({
    nome: formData.get("nome"),
    petshop: formData.get("petshop") ?? "",
    telefone: formData.get("telefone"),
  });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const telefone = normalizePhoneBR(p.data.telefone);
  if (!telefone) return { error: "WhatsApp inválido. Use DDD + número." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  const db = createAdminClient();
  if (ip) {
    const { count } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("criado_em", new Date(Date.now() - 60 * 60_000).toISOString());
    if ((count ?? 0) >= MAX_POR_IP_HORA) return { error: "Muitas tentativas. Tente de novo mais tarde." };
  }

  // Mesmo WhatsApp de novo: não duplica, só registra o novo interesse.
  const { data: existente } = await db.from("leads").select("id").eq("telefone", telefone).maybeSingle();
  if (existente) {
    await db.from("leads_historico").insert({ lead_id: existente.id, tipo: "nota", texto: "Pediu contato de novo pela landing page." });
    return { ok: true };
  }

  const { data: novo, error } = await db
    .from("leads")
    .insert({ nome: p.data.nome, telefone, petshop_nome: p.data.petshop || null, origem: "landing", ip })
    .select("id")
    .single();
  if (error || !novo) return { error: "Não foi possível enviar agora. Tente de novo." };
  await db.from("leads_historico").insert({ lead_id: novo.id, tipo: "etapa", texto: "Deixou o contato na landing page." });
  return { ok: true };
}
