import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lerModulos, TODOS_MODULOS, type Modulo } from "@/lib/permissoes";

export type Acesso = {
  userId: string;
  email: string;
  nome: string;
  petshopId: string;
  dono: boolean;
  modulos: Modulo[];
};

/** Usuário logado e o que ele pode ver (uma consulta por requisição). */
export const acessoAtual = cache(async (): Promise<Acesso | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome, petshop_id, role, permissoes, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || !perfil.ativo) return null;
  const dono = perfil.role === "dono";
  return {
    userId: user.id,
    email: user.email ?? "",
    nome: perfil.nome,
    petshopId: perfil.petshop_id,
    dono,
    modulos: dono ? TODOS_MODULOS : lerModulos(perfil.permissoes),
  };
});

export function pode(acesso: Acesso | null, modulo: Modulo): boolean {
  return !!acesso && (acesso.dono || acesso.modulos.includes(modulo));
}

/** Para server actions: devolve o erro pronto, ou null se pode seguir. */
export async function semPermissao(...modulos: Modulo[]): Promise<{ error: string } | null> {
  const acesso = await acessoAtual();
  if (!acesso) return { error: "Sessão expirada. Entre de novo." };
  if (modulos.some((m) => pode(acesso, m))) return null;
  return { error: "Seu usuário não tem acesso a essa área. Fale com o dono do petshop." };
}

/** Para páginas: sem acesso, volta pro início com aviso. */
export async function exigirModulo(modulo: Modulo): Promise<Acesso> {
  const acesso = await acessoAtual();
  if (!acesso) redirect("/login");
  if (!pode(acesso, modulo)) redirect(`/dashboard?sem_acesso=${modulo}`);
  return acesso;
}

export async function exigirDono(): Promise<Acesso> {
  const acesso = await acessoAtual();
  if (!acesso) redirect("/login");
  if (!acesso.dono) redirect("/dashboard?sem_acesso=equipe");
  return acesso;
}
