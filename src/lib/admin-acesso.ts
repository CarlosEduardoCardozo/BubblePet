import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/admin";
import { lerSuporte } from "@/lib/suporte";
import { usuarioAtual } from "@/lib/supabase/usuario";

/** Para páginas do admin: quem não é admin (ou está em modo suporte) vê "não encontrado". */
export async function exigirAdminPagina(): Promise<{ userId: string; email: string }> {
  const supabase = await createClient();
  const user = await usuarioAtual(supabase);
  if (!user || !ehAdmin(user.email) || (await lerSuporte(user.id))) notFound();
  return { userId: user.id, email: user.email };
}

/** Para ações do admin: confere de novo, nunca confia na tela. */
export async function exigirAdminAcao(): Promise<{ userId: string; email: string } | null> {
  const supabase = await createClient();
  const user = await usuarioAtual(supabase);
  if (!user || !ehAdmin(user.email) || (await lerSuporte(user.id))) return null;
  return { userId: user.id, email: user.email };
}
