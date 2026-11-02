"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneBR } from "@/lib/phone";
import { slugify, slugValido } from "@/lib/slug";
import { prazoDoTeste } from "@/lib/teste";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome"),
  petshop: z.string().trim().min(2, "Informe o nome do petshop").max(80),
  telefone: z.string().trim(),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72),
});

export type CadastroState = { error?: string } | undefined;

/** Slug livre a partir do nome: "petshop-araquari", "petshop-araquari-2"... */
async function slugDisponivel(nome: string): Promise<string> {
  const db = createAdminClient();
  let base = slugify(nome);
  if (!slugValido(base)) base = "petshop";
  for (let i = 1; i <= 20; i++) {
    const candidato = i === 1 ? base : `${base.slice(0, 36)}-${i}`;
    const { data } = await db.from("petshops").select("id").eq("slug", candidato).maybeSingle();
    if (!data) return candidato;
  }
  return `${base.slice(0, 30)}-${crypto.randomUUID().slice(0, 6)}`;
}

/** Cria o lead (ou atualiza o que já veio da landing, pelo telefone) na etapa "teste". */
async function registrarLeadDoCadastro(
  db: ReturnType<typeof createAdminClient>,
  d: { nome: string; telefone: string | null; email: string; petshopNome: string; petshopId: string }
) {
  const existente = d.telefone
    ? (await db.from("leads").select("id").eq("telefone", d.telefone).maybeSingle()).data
    : null;
  const campos = {
    nome: d.nome,
    email: d.email,
    petshop_nome: d.petshopNome,
    petshop_id: d.petshopId,
    etapa: "teste",
    atualizado_em: new Date().toISOString(),
  };
  if (existente) {
    await db.from("leads").update(campos).eq("id", existente.id);
    await db.from("leads_historico").insert({ lead_id: existente.id, tipo: "etapa", texto: "Criou a conta e começou o teste grátis." });
    return;
  }
  const { data: novo } = await db.from("leads").insert({ ...campos, telefone: d.telefone, origem: "cadastro" }).select("id").single();
  if (novo) await db.from("leads_historico").insert({ lead_id: novo.id, tipo: "etapa", texto: "Criou a conta e começou o teste grátis." });
}

/**
 * Conta nova liberada na hora: cria o usuário (e-mail já confirmado), o
 * petshop e o perfil de dono, e entra. Se algo falhar no meio, desfaz o que
 * já foi criado — nunca sobra usuário sem petshop.
 */
export async function cadastrar(_prev: CadastroState, formData: FormData): Promise<CadastroState> {
  // Campo escondido: robô que preenche tudo cai aqui.
  if (String(formData.get("site") ?? "").trim()) return { error: "Não foi possível criar a conta." };

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    petshop: formData.get("petshop"),
    telefone: formData.get("telefone") ?? "",
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  let telefone: string | null = null;
  if (d.telefone) {
    telefone = normalizePhoneBR(d.telefone);
    if (!telefone) return { error: "WhatsApp inválido. Use DDD + número." };
  }

  const db = createAdminClient();
  const { data: criado, error: erroUsuario } = await db.auth.admin.createUser({
    email: d.email,
    password: d.senha,
    email_confirm: true,
    user_metadata: { nome: d.nome },
  });
  if (erroUsuario || !criado.user) {
    const jaExiste =
      erroUsuario?.code === "email_exists" || /already|registered|exists/i.test(erroUsuario?.message ?? "");
    return {
      error: jaExiste
        ? "Já existe uma conta com esse e-mail. Entre pela tela de login."
        : erroUsuario?.code === "weak_password"
          ? "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números."
          : "Não foi possível criar a conta. Tente de novo.",
    };
  }
  const userId = criado.user.id;

  const { data: petshop, error: erroPetshop } = await db
    .from("petshops")
    // Conta nova nasce em teste grátis, com o prazo já gravado.
    .insert({
      nome: d.petshop,
      telefone,
      slug: await slugDisponivel(d.petshop),
      plano_status: "teste",
      teste_ate: prazoDoTeste(),
    })
    .select("id")
    .single();
  if (erroPetshop || !petshop) {
    await db.auth.admin.deleteUser(userId);
    return { error: "Não foi possível criar a conta. Tente de novo." };
  }

  const { error: erroPerfil } = await db
    .from("perfis")
    .insert({ id: userId, petshop_id: petshop.id, nome: d.nome, role: "dono" });
  if (erroPerfil) {
    await db.from("petshops").delete().eq("id", petshop.id);
    await db.auth.admin.deleteUser(userId);
    return { error: "Não foi possível criar a conta. Tente de novo." };
  }

  // Entra no CRM como lead em teste. Falha aqui nunca derruba o cadastro.
  try {
    await registrarLeadDoCadastro(db, { nome: d.nome, telefone, email: d.email, petshopNome: d.petshop, petshopId: petshop.id });
  } catch (e) {
    console.error("Não foi possível registrar o lead do cadastro", e);
  }

  const supabase = await createClient();
  const { error: erroLogin } = await supabase.auth.signInWithPassword({
    email: d.email,
    password: d.senha,
  });
  if (erroLogin) redirect("/login");

  redirect("/configuracoes?bemvindo=1");
}
