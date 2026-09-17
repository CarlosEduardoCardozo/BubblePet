import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";

/**
 * Modo suporte: o admin do BubblePet entra na conta de um usuário pra ver
 * como ele está usando. A sessão do Supabase passa a ser a do usuário; este
 * cookie assinado só guarda quem é o admin, pra voltar pra conta dele depois.
 * Cada entrada fica registrada em acessos_suporte.
 */
const COOKIE = "bp_suporte";
const DURACAO_SEG = 2 * 60 * 60;

export type SessaoSuporte = {
  acessoId: string;
  alvoId: string;
  adminId: string;
  adminEmail: string;
  alvoNome: string;
  petshopNome: string;
};

function segredo(): Uint8Array {
  const raw = process.env.AGENDAR_SESSION_SECRET;
  if (!raw) throw new Error("AGENDAR_SESSION_SECRET não configurado.");
  // Chave derivada: um token do link público nunca vale como token de suporte.
  return new TextEncoder().encode(`suporte:${raw}`);
}

/**
 * Sessão de suporte válida pro usuário logado agora. Se quem está logado não
 * é o usuário que o admin abriu (saiu e entrou com outra conta), não vale.
 */
export async function lerSuporte(userIdAtual: string): Promise<SessaoSuporte | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo(), { algorithms: ["HS256"] });
    if (payload.typ !== "suporte" || typeof payload.adminEmail !== "string" || !ehAdmin(payload.adminEmail)) {
      return null;
    }
    if (payload.alvoId !== userIdAtual) return null;
    return {
      acessoId: String(payload.acessoId),
      alvoId: String(payload.alvoId),
      adminId: String(payload.adminId),
      adminEmail: payload.adminEmail,
      alvoNome: String(payload.alvoNome ?? ""),
      petshopNome: String(payload.petshopNome ?? ""),
    };
  } catch {
    return null;
  }
}

/** Troca a sessão do navegador pela do usuário com esse e-mail (sem enviar e-mail). */
async function entrarComoEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) return "Não foi possível gerar o acesso.";
  const supabase = await createClient();
  const { error: erroVerificar } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: hash });
  return erroVerificar ? "Não foi possível entrar na conta." : null;
}

export async function iniciarSuporte(alvoId: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !ehAdmin(user.email)) return { error: "Sem permissão." };
  if (alvoId === user.id) return { error: "Essa já é a sua conta." };

  const admin = createAdminClient();
  const [{ data: alvo }, { data: perfil }] = await Promise.all([
    admin.auth.admin.getUserById(alvoId),
    admin.from("perfis").select("nome, petshop_id, petshops(nome)").eq("id", alvoId).maybeSingle(),
  ]);
  const email = alvo?.user?.email;
  if (!email || !perfil) return { error: "Usuário não encontrado." };
  if (ehAdmin(email)) return { error: "Não dá pra entrar na conta de outro admin." };

  const { data: acesso, error: erroRegistro } = await admin
    .from("acessos_suporte")
    .insert({ admin_id: user.id, alvo_id: alvoId, petshop_id: perfil.petshop_id })
    .select("id")
    .single();
  if (erroRegistro || !acesso) return { error: "Não foi possível registrar o acesso." };

  const petshop = perfil.petshops as unknown as { nome: string } | null;
  const token = await new SignJWT({
    typ: "suporte",
    acessoId: acesso.id,
    alvoId,
    adminId: user.id,
    adminEmail: user.email,
    alvoNome: perfil.nome,
    petshopNome: petshop?.nome ?? "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SEG}s`)
    .sign(segredo());

  const erro = await entrarComoEmail(email);
  if (erro) return { error: erro };

  (await cookies()).set({
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_SEG,
  });
  return { ok: true };
}

/** Volta pra conta do admin. Sem cookie válido, só sai (vai pro login). */
export async function encerrarSuporte(): Promise<"admin" | "login"> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sessao = user ? await lerSuporte(user.id) : null;
  const store = await cookies();
  store.set({ name: COOKIE, value: "", path: "/", maxAge: 0 });
  if (!sessao) {
    await supabase.auth.signOut();
    return "login";
  }
  await createAdminClient()
    .from("acessos_suporte")
    .update({ fim: new Date().toISOString() })
    .eq("id", sessao.acessoId);
  const erro = await entrarComoEmail(sessao.adminEmail);
  if (erro) {
    await supabase.auth.signOut();
    return "login";
  }
  return "admin";
}

/** Logout comum: se estava em modo suporte, fecha o registro e limpa o cookie. */
export async function limparSuporteNoLogout(userId: string): Promise<void> {
  const sessao = await lerSuporte(userId);
  const store = await cookies();
  if (store.get(COOKIE)) store.set({ name: COOKIE, value: "", path: "/", maxAge: 0 });
  if (sessao) {
    await createAdminClient()
      .from("acessos_suporte")
      .update({ fim: new Date().toISOString() })
      .eq("id", sessao.acessoId);
  }
}
