/**
 * Cria o petshop + dono iniciais (Fase 0).
 * Uso: SEED_PETSHOP_NOME="..." SEED_DONO_NOME="..." SEED_DONO_EMAIL="..." SEED_DONO_SENHA="..." npm run seed
 * Campos faltando são perguntados interativamente.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";

process.loadEnvFile(".env.local");

async function ask(question: string, envValue: string | undefined) {
  if (envValue) return envValue;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar em .env.local " +
        "(a service_role key fica em Supabase Dashboard > Project Settings > API)."
    );
  }

  const petshopNome = await ask("Nome do petshop: ", process.env.SEED_PETSHOP_NOME);
  const donoNome = await ask("Nome do dono: ", process.env.SEED_DONO_NOME);
  const donoEmail = await ask("E-mail do dono: ", process.env.SEED_DONO_EMAIL);
  const donoSenha = await ask("Senha do dono (min. 6 caracteres): ", process.env.SEED_DONO_SENHA);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Reaproveita o usuário se já existir (ex.: criado manualmente no dashboard).
  let userId: string;
  const { data: listaUsuarios, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const usuarioExistente = listaUsuarios.users.find((u) => u.email === donoEmail);

  if (usuarioExistente) {
    userId = usuarioExistente.id;
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: donoSenha,
      email_confirm: true,
    });
    if (updateError) throw updateError;
  } else {
    const { data: userResult, error: userError } = await admin.auth.admin.createUser({
      email: donoEmail,
      password: donoSenha,
      email_confirm: true,
    });
    if (userError) throw userError;
    userId = userResult.user.id;
  }

  const { data: perfilDoUsuario } = await admin
    .from("perfis")
    .select("petshop_id")
    .eq("id", userId)
    .maybeSingle();

  if (perfilDoUsuario) {
    console.log(
      `\nUsuário ${donoEmail} já tem petshop vinculado (${perfilDoUsuario.petshop_id}). Nada a fazer.`
    );
    return;
  }

  const { data: petshop, error: petshopError } = await admin
    .from("petshops")
    .insert({ nome: petshopNome })
    .select("id")
    .single();
  if (petshopError) throw petshopError;

  const { error: perfilError } = await admin.from("perfis").insert({
    id: userId,
    petshop_id: petshop.id,
    nome: donoNome,
    role: "dono",
  });
  if (perfilError) throw perfilError;

  console.log(`\nPronto! Petshop "${petshopNome}" (${petshop.id}) criado.`);
  console.log(`Dono: ${donoEmail} — já pode logar em /login.`);
}

main().catch((error) => {
  console.error("Falha ao rodar o seed:", error.message ?? error);
  process.exit(1);
});
