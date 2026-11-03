"use server";

import { revalidatePath } from "next/cache";
import { acessoAtual } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { MISSOES, type OnboardingSalvo, type StatusBanco } from "@/lib/onboarding";

export type EstadoOnboarding = { status: StatusBanco; salvo: OnboardingSalvo; slug: string | null };

export async function estadoOnboarding(): Promise<EstadoOnboarding | { error: string }> {
  if (!(await acessoAtual())) return { error: "Sessão expirada." };
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const [{ data: status }, { data: petshop }] = await Promise.all([
    supabase.rpc("onboarding_status"),
    supabase.from("petshops").select("slug, onboarding").eq("id", petshopId).maybeSingle(),
  ]);
  if (!status || !petshop) return { error: "Não foi possível carregar os primeiros passos." };
  return { status: status as StatusBanco, salvo: (petshop.onboarding as OnboardingSalvo) ?? {}, slug: petshop.slug };
}

/** Junta `parte` ao que já está guardado (sem apagar o resto). */
async function guardar(alterar: (atual: OnboardingSalvo) => OnboardingSalvo): Promise<{ error: string } | { success: true }> {
  if (!(await acessoAtual())) return { error: "Sessão expirada." };
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data } = await supabase.from("petshops").select("onboarding").eq("id", petshopId).maybeSingle();
  const novo = alterar(((data?.onboarding as OnboardingSalvo) ?? {}) as OnboardingSalvo);
  const { error } = await supabase.from("petshops").update({ onboarding: novo }).eq("id", petshopId);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { success: true };
}

/** "Pular por agora" (dispensar = true) ou voltar a mostrar (false). */
export async function dispensarOnboarding(dispensar: boolean) {
  // Pular ou reabrir contam como "já viu a apresentação": ela não volta a aparecer.
  return guardar((a) => ({
    ...a,
    dispensado_em: dispensar ? new Date().toISOString() : undefined,
    boas_vindas_em: a.boas_vindas_em ?? new Date().toISOString(),
  }));
}

export async function marcarBoasVindas() {
  return guardar((a) => ({ ...a, boas_vindas_em: a.boas_vindas_em ?? new Date().toISOString() }));
}

export async function marcarLinkCompartilhado() {
  return guardar((a) => ({ ...a, link_compartilhado: true }));
}

/** Guarda quais missões já foram comemoradas, para a festa não repetir. */
export async function celebrarMissoes(ids: string[]) {
  const validos = ids.filter((id) => MISSOES.some((m) => m.id === id));
  return guardar((a) => ({ ...a, celebrados: Array.from(new Set([...(a.celebrados ?? []), ...validos])) }));
}
