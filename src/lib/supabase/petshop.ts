import type { SupabaseClient } from "@supabase/supabase-js";

/** Petshop do usuário autenticado, via a RPC current_petshop_id() (mesma usada pelas RLS policies). */
export async function getCurrentPetshopId(
  supabase: SupabaseClient
): Promise<string> {
  const { data, error } = await supabase.rpc("current_petshop_id");
  if (error) throw error;
  if (!data) throw new Error("Usuário sem petshop vinculado.");
  return data as string;
}
