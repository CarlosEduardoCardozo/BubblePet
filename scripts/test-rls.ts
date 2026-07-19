/**
 * Testa isolamento multi-tenant: cria 2 petshops fake com 1 dono cada e garante
 * que o dono A nunca enxerga (nem consegue escrever) dados do petshop B.
 * Uso: npm run test:rls
 */
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY " +
      "precisam estar em .env.local."
  );
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Check = { nome: string; ok: boolean; detalhe?: string };
const checks: Check[] = [];

function record(nome: string, ok: boolean, detalhe?: string) {
  checks.push({ nome, ok, detalhe });
  console.log(`${ok ? "✔" : "✘"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}

async function criarTenant(sufixo: string) {
  const senha = `Senha-teste-${sufixo}-123!`;
  const email = `rls-test-${sufixo}-${Date.now()}@example.com`;

  const { data: petshop, error: petshopError } = await admin
    .from("petshops")
    .insert({ nome: `Petshop Teste ${sufixo}` })
    .select("id")
    .single();
  if (petshopError) throw petshopError;

  const { data: userResult, error: userError } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (userError) throw userError;

  const { error: perfilError } = await admin
    .from("perfis")
    .insert({ id: userResult.user.id, petshop_id: petshop.id, nome: `Dono ${sufixo}`, role: "dono" });
  if (perfilError) throw perfilError;

  const { data: tutor, error: tutorError } = await admin
    .from("tutores")
    .insert({ petshop_id: petshop.id, nome: `Tutor ${sufixo}`, telefone: "+5547999999999" })
    .select("id")
    .single();
  if (tutorError) throw tutorError;

  const asDono = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await asDono.auth.signInWithPassword({ email, password: senha });
  if (signInError) throw signInError;

  return { petshopId: petshop.id as string, userId: userResult.user.id, tutorId: tutor.id as string, client: asDono };
}

async function limpar(petshopIds: string[], userIds: string[]) {
  for (const id of petshopIds) {
    await admin.from("petshops").delete().eq("id", id); // cascade cuida de perfis/tutores/pets
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
}

async function main() {
  const a = await criarTenant("a");
  const b = await criarTenant("b");

  try {
    const { data: propriosTutores, error: e1 } = await a.client
      .from("tutores")
      .select("id")
      .eq("petshop_id", a.petshopId);
    record("Dono A lê os próprios tutores", !e1 && (propriosTutores?.length ?? 0) === 1, e1?.message);

    const { data: tutoresDeB, error: e2 } = await a.client
      .from("tutores")
      .select("id")
      .eq("petshop_id", b.petshopId);
    record(
      "Dono A NÃO lê tutores do petshop B",
      !e2 && (tutoresDeB?.length ?? 0) === 0,
      e2?.message
    );

    const { error: e3 } = await a.client
      .from("tutores")
      .insert({ petshop_id: b.petshopId, nome: "Invasor", telefone: "+5547988888888" });
    record("Dono A NÃO consegue inserir tutor no petshop B", !!e3, e3?.message ?? "insert foi aceito (falha!)");

    const { data: petshopB, error: e4 } = await a.client
      .from("petshops")
      .select("id")
      .eq("id", b.petshopId);
    record(
      "Dono A NÃO lê a linha do petshop B",
      !e4 && (petshopB?.length ?? 0) === 0,
      e4?.message
    );

    const { data: tutoresDeA, error: e5 } = await b.client
      .from("tutores")
      .select("id")
      .eq("petshop_id", a.petshopId);
    record(
      "Dono B NÃO lê tutores do petshop A (checagem inversa)",
      !e5 && (tutoresDeA?.length ?? 0) === 0,
      e5?.message
    );
  } finally {
    await limpar([a.petshopId, b.petshopId], [a.userId, b.userId]);
  }

  const falhas = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - falhas.length}/${checks.length} checagens passaram.`);
  if (falhas.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Erro ao rodar o teste de RLS:", error.message ?? error);
  process.exit(1);
});
