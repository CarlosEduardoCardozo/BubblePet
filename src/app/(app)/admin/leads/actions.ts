"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAdminAcao } from "@/lib/admin-acesso";
import { normalizePhoneBR } from "@/lib/phone";
import { enviarPelaPlataforma } from "@/lib/plataforma";
import { ETAPAS, ETAPA_INFO, type EntradaHistorico, type EtapaLead } from "@/lib/leads";

type Resultado = { error: string } | { success: true };

const formSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(80),
  telefone: z.string().trim().max(30),
  email: z.string().trim().toLowerCase().max(120),
  petshopNome: z.string().trim().max(80),
  observacoes: z.string().trim().max(1000),
  etapa: z.enum(ETAPAS),
});
export type LeadForm = z.input<typeof formSchema>;

function ler(form: LeadForm): { error: string } | { campos: Record<string, unknown> } {
  const p = formSchema.safeParse(form);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  let telefone: string | null = null;
  if (d.telefone) {
    telefone = normalizePhoneBR(d.telefone);
    if (!telefone) return { error: "WhatsApp inválido. Use DDD + número." };
  }
  if (d.email && !z.string().email().safeParse(d.email).success) return { error: "E-mail inválido." };
  if (!telefone && !d.email) return { error: "Informe o WhatsApp ou o e-mail." };
  return {
    campos: {
      nome: d.nome,
      telefone,
      email: d.email || null,
      petshop_nome: d.petshopNome || null,
      observacoes: d.observacoes || null,
      etapa: d.etapa,
    },
  };
}

function erroBanco(e: { code?: string } | null): string {
  return e?.code === "23505" ? "Já existe um lead com esse WhatsApp." : "Não foi possível salvar.";
}

export async function criarLead(form: LeadForm): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const lido = ler(form);
  if ("error" in lido) return lido;
  const db = createAdminClient();
  const { data, error } = await db.from("leads").insert({ ...lido.campos, origem: "manual" }).select("id").single();
  if (error || !data) return { error: erroBanco(error) };
  await db.from("leads_historico").insert({ lead_id: data.id, tipo: "etapa", texto: "Lead criado manualmente." });
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function atualizarLead(id: string, form: LeadForm): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const lido = ler(form);
  if ("error" in lido) return lido;
  const db = createAdminClient();
  const { data: antes } = await db.from("leads").select("etapa").eq("id", id).maybeSingle();
  if (!antes) return { error: "Lead não encontrado." };
  const { error } = await db.from("leads").update({ ...lido.campos, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { error: erroBanco(error) };
  if (antes.etapa !== form.etapa) {
    await db.from("leads_historico").insert({ lead_id: id, tipo: "etapa", texto: `Etapa: ${ETAPA_INFO[antes.etapa as EtapaLead].label} → ${ETAPA_INFO[form.etapa].label}` });
  }
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function mudarEtapaLead(id: string, etapa: EtapaLead): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  if (!ETAPAS.includes(etapa)) return { error: "Etapa inválida." };
  const db = createAdminClient();
  const { data: antes } = await db.from("leads").select("etapa").eq("id", id).maybeSingle();
  if (!antes) return { error: "Lead não encontrado." };
  if (antes.etapa === etapa) return { success: true };
  const { error } = await db.from("leads").update({ etapa, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Não foi possível mudar a etapa." };
  await db.from("leads_historico").insert({ lead_id: id, tipo: "etapa", texto: `Etapa: ${ETAPA_INFO[antes.etapa as EtapaLead].label} → ${ETAPA_INFO[etapa].label}` });
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function adicionarNotaLead(id: string, texto: string): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const limpo = texto.trim().slice(0, 1000);
  if (!limpo) return { error: "Escreva a anotação." };
  const db = createAdminClient();
  const { error } = await db.from("leads_historico").insert({ lead_id: id, tipo: "nota", texto: limpo });
  if (error) return { error: "Não foi possível salvar a anotação." };
  return { success: true };
}

export async function enviarMensagemLead(id: string, texto: string): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const limpo = texto.trim().slice(0, 1500);
  if (!limpo) return { error: "Escreva a mensagem." };
  const db = createAdminClient();
  const { data: lead } = await db.from("leads").select("telefone, optout").eq("id", id).maybeSingle();
  if (!lead?.telefone) return { error: "Esse lead não tem WhatsApp." };
  if (lead.optout) return { error: "Essa pessoa pediu para não receber mensagens." };
  const r = await enviarPelaPlataforma(lead.telefone, limpo);
  if (!r.ok) return { error: r.erro };
  await db.from("leads").update({ ultimo_contato_em: new Date().toISOString() }).eq("id", id);
  await db.from("leads_historico").insert({ lead_id: id, tipo: "mensagem", texto: limpo });
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function alternarOptoutLead(id: string, optout: boolean): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const db = createAdminClient();
  const { error } = await db.from("leads").update({ optout, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  await db.from("leads_historico").insert({ lead_id: id, tipo: "nota", texto: optout ? "Marcado para não receber mais mensagens." : "Voltou a poder receber mensagens." });
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function excluirLead(id: string): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const { error } = await createAdminClient().from("leads").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function carregarHistoricoLead(id: string): Promise<EntradaHistorico[]> {
  if (!(await exigirAdminAcao())) return [];
  const { data } = await createAdminClient()
    .from("leads_historico")
    .select("id, tipo, texto, criado_em")
    .eq("lead_id", id)
    .order("criado_em", { ascending: false })
    .limit(100);
  return (data ?? []).map((h) => ({ id: h.id, tipo: h.tipo, texto: h.texto, criadoEm: h.criado_em }));
}
