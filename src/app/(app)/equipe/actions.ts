"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { acessoAtual } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { TODOS_MODULOS, type Modulo } from "@/lib/permissoes";

type ActionResult = { error: string } | { success: true };

const modulosSchema = z
  .array(z.enum(TODOS_MODULOS as [Modulo, ...Modulo[]]))
  .min(1, "Marque ao menos uma área.");

/** Só o dono mexe na equipe, e só em usuários do próprio petshop. */
async function exigirDono(alvoId?: string): Promise<{ error: string } | { petshopId: string; userId: string }> {
  const acesso = await acessoAtual();
  if (!acesso?.dono) return { error: "Só o dono do petshop pode mexer na equipe." };
  if (alvoId) {
    if (alvoId === acesso.userId) return { error: "Esse é o seu usuário de dono." };
    const { data: alvo } = await createAdminClient()
      .from("perfis")
      .select("petshop_id, role")
      .eq("id", alvoId)
      .maybeSingle();
    if (!alvo || alvo.petshop_id !== acesso.petshopId) return { error: "Usuário não encontrado." };
    if (alvo.role === "dono") return { error: "O dono sempre tem acesso a tudo." };
  }
  return { petshopId: acesso.petshopId, userId: acesso.userId };
}

const novoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(72),
  modulos: modulosSchema,
});

export async function criarUsuario(dados: z.input<typeof novoSchema>): Promise<ActionResult> {
  const dono = await exigirDono();
  if ("error" in dono) return dono;
  const parsed = novoSchema.safeParse(dados);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.senha,
    email_confirm: true,
    user_metadata: { nome: d.nome },
  });
  if (error || !criado.user) {
    const jaExiste = error?.code === "email_exists" || /already|registered|exists/i.test(error?.message ?? "");
    return {
      error: jaExiste
        ? "Esse e-mail já tem conta no BubblePet. Use outro e-mail."
        : error?.code === "weak_password"
          ? "Senha fraca. Misture letras e números."
          : "Não foi possível criar o usuário.",
    };
  }

  const { error: erroPerfil } = await admin.from("perfis").insert({
    id: criado.user.id,
    petshop_id: dono.petshopId,
    nome: d.nome,
    role: "staff",
    permissoes: d.modulos,
    criado_por: dono.userId,
  });
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return { error: "Não foi possível criar o usuário." };
  }

  revalidatePath("/equipe");
  return { success: true };
}

export async function atualizarUsuario(
  id: string,
  dados: { nome: string; modulos: Modulo[] }
): Promise<ActionResult> {
  const dono = await exigirDono(id);
  if ("error" in dono) return dono;
  const nome = dados.nome.trim();
  if (nome.length < 2) return { error: "Informe o nome." };
  const modulos = modulosSchema.safeParse(dados.modulos);
  if (!modulos.success) return { error: modulos.error.issues[0]?.message ?? "Áreas inválidas." };

  const { error } = await createAdminClient()
    .from("perfis")
    .update({ nome, permissoes: modulos.data })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/equipe");
  return { success: true };
}

export async function alterarAtivoUsuario(id: string, ativo: boolean): Promise<ActionResult> {
  const dono = await exigirDono(id);
  if ("error" in dono) return dono;
  const admin = createAdminClient();
  const { error } = await admin.from("perfis").update({ ativo }).eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  // Desativado perde o acesso na hora: as RLS param de devolver dados e o
  // painel manda pra tela de acesso suspenso na próxima página.
  revalidatePath("/equipe");
  return { success: true };
}

export async function redefinirSenhaUsuario(id: string, senha: string): Promise<ActionResult> {
  const dono = await exigirDono(id);
  if ("error" in dono) return dono;
  if (senha.length < 8) return { error: "A senha precisa de pelo menos 8 caracteres." };
  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: senha });
  if (error) {
    return { error: error.code === "weak_password" ? "Senha fraca. Misture letras e números." : "Não foi possível trocar a senha." };
  }
  return { success: true };
}
