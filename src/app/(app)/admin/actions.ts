"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import { iniciarSuporte } from "@/lib/suporte";
import { prazoDoTeste } from "@/lib/teste";

type ActionResult = { error: string } | { success: true };

/** Toda action do admin confere o e-mail de novo — nunca confia na tela. */
async function exigirAdmin(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !ehAdmin(user.email)) return null;
  return { userId: user.id };
}

export async function alterarStatusPetshop(
  petshopId: string,
  status: "ativo" | "congelado"
): Promise<ActionResult> {
  const admin = await exigirAdmin();
  if (!admin) return { error: "Sem permissão." };
  if (status !== "ativo" && status !== "congelado") return { error: "Status inválido." };

  const db = createAdminClient();
  if (status === "congelado") {
    // Congelar a própria conta tiraria o acesso ao painel admin.
    const { data: meuPerfil } = await db
      .from("perfis")
      .select("petshop_id")
      .eq("id", admin.userId)
      .maybeSingle();
    if (meuPerfil?.petshop_id === petshopId) {
      return { error: "Essa é a sua própria conta — não dá pra congelar." };
    }
  }

  const { error } = await db
    .from("petshops")
    .update({ status, congelado_em: status === "congelado" ? new Date().toISOString() : null })
    .eq("id", petshopId);
  if (error) return { error: "Não foi possível alterar o status." };

  revalidatePath("/admin");
  return { success: true };
}

/**
 * Entra na conta do usuário pra acompanhar o uso e ajudar (modo suporte). O
 * usuário não é avisado; o acesso fica registrado em acessos_suporte.
 */
export async function entrarComo(userId: string): Promise<ActionResult> {
  const admin = await exigirAdmin();
  if (!admin) return { error: "Sem permissão." };
  const r = await iniciarSuporte(userId);
  if ("error" in r) return r;
  redirect("/dashboard");
}

/**
 * Plano da conta: virar assinante (libera de vez), estender o teste ou
 * colocar em teste (5 dias a partir de agora). O lead da conta acompanha.
 */
export async function definirPlanoConta(
  petshopId: string,
  acao: { tipo: "assinante" } | { tipo: "estender"; dias: number } | { tipo: "teste" }
): Promise<ActionResult> {
  const admin = await exigirAdmin();
  if (!admin) return { error: "Sem permissão." };
  const db = createAdminClient();
  const { data: conta } = await db.from("petshops").select("plano_status, teste_ate").eq("id", petshopId).maybeSingle();
  if (!conta) return { error: "Conta não encontrada." };

  let campos: Record<string, unknown>;
  let etapaLead: string | null = null;
  let historico: string;
  if (acao.tipo === "assinante") {
    campos = { plano_status: "assinante", assinou_em: new Date().toISOString() };
    etapaLead = "assinante";
    historico = "Virou assinante.";
  } else if (acao.tipo === "estender") {
    const dias = Math.min(30, Math.max(1, Math.round(acao.dias)));
    const base = conta.teste_ate && new Date(conta.teste_ate) > new Date() ? new Date(conta.teste_ate) : new Date();
    campos = { plano_status: "teste", teste_ate: new Date(base.getTime() + dias * 86_400_000).toISOString() };
    etapaLead = "teste";
    historico = `Teste estendido em ${dias} ${dias === 1 ? "dia" : "dias"}.`;
  } else {
    campos = { plano_status: "teste", teste_ate: prazoDoTeste(), assinou_em: null };
    etapaLead = "teste";
    historico = "Conta colocada em teste grátis.";
  }

  const { error } = await db.from("petshops").update(campos).eq("id", petshopId);
  if (error) return { error: "Não foi possível alterar o plano." };

  const { data: leads } = await db.from("leads").select("id").eq("petshop_id", petshopId);
  for (const lead of leads ?? []) {
    if (etapaLead) await db.from("leads").update({ etapa: etapaLead, atualizado_em: new Date().toISOString() }).eq("id", lead.id);
    await db.from("leads_historico").insert({ lead_id: lead.id, tipo: "etapa", texto: historico });
  }
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/", "layout");
  return { success: true };
}
