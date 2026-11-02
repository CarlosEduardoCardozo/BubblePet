import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Usuário logado, conferido pela assinatura do token (getClaims): sem ir ao
 * servidor de autenticação a cada requisição, o que economizava uma viagem de
 * rede por página e por ação. Vale porque o projeto usa chaves assimétricas;
 * o token só deixa de valer na expiração (até 1 h), e o perfil ativo continua
 * conferido no banco.
 */
export async function usuarioAtual(supabase: SupabaseClient): Promise<{ id: string; email: string } | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
}
