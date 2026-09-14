"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";

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
