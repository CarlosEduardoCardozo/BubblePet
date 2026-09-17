import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const INTERVALO_USO_MS = 5 * 60 * 1000;

/** Marca que o usuário está usando o painel (no máximo a cada 5 min). */
export async function registrarUso(userId: string, ultimoUso: string | null): Promise<void> {
  if (ultimoUso && Date.now() - new Date(ultimoUso).getTime() < INTERVALO_USO_MS) return;
  await createAdminClient()
    .from("perfis")
    .update({ ultimo_uso_em: new Date().toISOString() })
    .eq("id", userId);
}
