/**
 * Petshop de demonstração usado na gravação dos tutoriais.
 *
 * Cria (ou recria do zero) o "Bolhinha Banho & Tosa" com clientes, pets,
 * serviços, um plano e agendamentos fictícios, e o usuário dono que o robô
 * usa pra entrar. Cada gravação começa do mesmo estado: assim o vídeo que
 * cadastra "Tosa higiênica" sempre encontra a tela sem ela.
 *
 * O petshop tem slug começando com "demo-": o Admin esconde ele das contas.
 * Nada aqui cria lead nem manda mensagem.
 *
 * Uso:
 *   npx tsx scripts/tutoriais/demo.ts           # cria ou recria
 *   npx tsx scripts/tutoriais/demo.ts --apagar  # apaga petshop e usuário
 *
 * Precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.
 * O login do dono fica em scripts/tutoriais/.demo.json (fora do git).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DateTime } from "luxon";

export const DEMO_SLUG = "demo-bolhinha";
export const DEMO_EMAIL = process.env.TUTORIAL_EMAIL ?? "demo.tutoriais@bubblepets.com.br";
const ARQUIVO_LOGIN = join(__dirname, ".demo.json");
const ZONE = "America/Sao_Paulo";

export type LoginDemo = { email: string; senha: string };

function db(): SupabaseClient {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function lerLoginDemo(): LoginDemo | null {
  if (!existsSync(ARQUIVO_LOGIN)) return null;
  return JSON.parse(readFileSync(ARQUIVO_LOGIN, "utf8")) as LoginDemo;
}

async function acharUsuario(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function apagarPetshop(admin: SupabaseClient) {
  const { data } = await admin.from("petshops").select("id").eq("slug", DEMO_SLUG).maybeSingle();
  if (!data) return;
  // Agendamentos e créditos antes, por causa das chaves; o resto cai em cascata.
  for (const tabela of ["creditos_movimentos", "agendamentos", "fechamentos", "assinaturas", "planos"]) {
    await admin.from(tabela).delete().eq("petshop_id", data.id);
  }
  const { error } = await admin.from("petshops").delete().eq("id", data.id);
  if (error) throw error;
}

function ok<T = { id: string }>(r: { data: unknown; error: { message: string } | null }, oQue: string): T {
  if (r.error || r.data == null) throw new Error(`Falhou ao criar ${oQue}: ${r.error?.message ?? "sem dados"}`);
  return r.data as T;
}

export async function recriarDemo(): Promise<LoginDemo> {
  const admin = db();
  await apagarPetshop(admin);

  // Usuário dono: reaproveita o de antes (mesma senha), ou cria.
  const anterior = lerLoginDemo();
  const senha = anterior?.senha ?? `Demo-${randomBytes(9).toString("base64url")}`;
  let userId = await acharUsuario(admin, DEMO_EMAIL);
  if (userId) {
    await admin.auth.admin.updateUserById(userId, { password: senha, email_confirm: true });
  } else {
    const r = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: "Carla" },
    });
    if (r.error || !r.data.user) throw new Error(`Falhou ao criar o usuário demo: ${r.error?.message}`);
    userId = r.data.user.id;
  }

  const petshop = ok(
    await admin
      .from("petshops")
      .insert({
        nome: "Bolhinha Banho & Tosa",
        slug: DEMO_SLUG,
        telefone: "+5547999990001",
        endereco: "Rua das Flores, 120 · Centro",
        plano_status: "assinante",
        capacidade_por_horario: 2,
        horario_abertura: "08:00",
        horario_fechamento: "18:00",
        dias_funcionamento: [1, 2, 3, 4, 5, 6],
      })
      .select("id")
      .single(),
    "o petshop"
  );
  const pid = petshop.id;

  await admin.from("perfis").delete().eq("id", userId);
  ok(await admin.from("perfis").insert({ id: userId, petshop_id: pid, nome: "Carla", role: "dono" }).select("id").single(), "o perfil");

  const servicos = ok(
    await admin
      .from("servicos")
      .insert([
        { petshop_id: pid, nome: "Banho", duracao_min: 60, preco_centavos: 5500, preco_pequeno_centavos: 4500, preco_medio_centavos: 5500, preco_grande_centavos: 7000 },
        { petshop_id: pid, nome: "Banho e tosa", duracao_min: 90, preco_centavos: 8500, preco_pequeno_centavos: 7000, preco_medio_centavos: 8500, preco_grande_centavos: 11000 },
        { petshop_id: pid, nome: "Hidratação", duracao_min: 30, preco_centavos: 3000 },
      ])
      .select("id, nome"),
    "os serviços"
  ) as { id: string; nome: string }[];
  const servico = (nome: string) => servicos.find((s) => s.nome === nome)!.id;

  const CLIENTES: { nome: string; tel: string; pets: { nome: string; raca: string; porte: "pequeno" | "medio" | "grande" }[] }[] = [
    { nome: "Ana Souza", tel: "+5547991110001", pets: [{ nome: "Thor", raca: "Golden Retriever", porte: "grande" }] },
    { nome: "Bruno Lima", tel: "+5547991110002", pets: [{ nome: "Mel", raca: "Shih-tzu", porte: "pequeno" }, { nome: "Paçoca", raca: "Shih-tzu", porte: "pequeno" }] },
    { nome: "Camila Rocha", tel: "+5547991110003", pets: [{ nome: "Luna", raca: "Border Collie", porte: "medio" }] },
    { nome: "Diego Alves", tel: "+5547991110004", pets: [{ nome: "Bob", raca: "SRD", porte: "medio" }] },
    { nome: "Fernanda Dias", tel: "+5547991110005", pets: [{ nome: "Nina", raca: "Poodle", porte: "pequeno" }] },
    { nome: "Gustavo Reis", tel: "+5547991110006", pets: [{ nome: "Max", raca: "Labrador", porte: "grande" }] },
    { nome: "Helena Martins", tel: "+5547991110007", pets: [{ nome: "Amora", raca: "Lhasa Apso", porte: "pequeno" }] },
    { nome: "Igor Pereira", tel: "+5547991110008", pets: [{ nome: "Fred", raca: "Bulldog Francês", porte: "medio" }] },
  ];
  const pets: { id: string; nome: string; porte: string }[] = [];
  for (const c of CLIENTES) {
    const tutor = ok(
      await admin.from("tutores").insert({ petshop_id: pid, nome: c.nome, telefone: c.tel }).select("id").single(),
      `o cliente ${c.nome}`
    ) as { id: string };
    const criados = ok(
      await admin
        .from("pets")
        .insert(c.pets.map((p) => ({ petshop_id: pid, tutor_id: tutor.id, nome: p.nome, raca: p.raca, porte: p.porte, especie: "cachorro" })))
        .select("id, nome, porte"),
      `os pets de ${c.nome}`
    ) as { id: string; nome: string; porte: string }[];
    pets.push(...criados);
  }
  const pet = (nome: string) => pets.find((p) => p.nome === nome)!.id;

  // Um plano já em uso (o vídeo de planos cria outro na hora).
  const plano = ok(
    await admin
      .from("planos")
      .insert({ petshop_id: pid, nome: "Plano Quinzenal", creditos_mes: 2, servico_id: servico("Banho"), preco_centavos: 9900 })
      .select("id")
      .single(),
    "o plano"
  ) as { id: string };
  for (const nome of ["Luna", "Nina"]) {
    await admin.from("assinaturas").insert({ petshop_id: pid, pet_id: pet(nome), plano_id: plano.id, status: "ativa" });
  }

  // Agenda: hoje (alguns já concluídos) e os próximos dias, em horários redondos.
  const hoje = DateTime.now().setZone(ZONE).startOf("day");
  const AGENDA: [number, string, string, string, string][] = [
    [0, "08:00", "Mel", "Banho", "concluido"],
    [0, "09:00", "Thor", "Banho e tosa", "concluido"],
    [0, "10:30", "Luna", "Banho", "confirmado"],
    [0, "13:00", "Bob", "Banho", "confirmado"],
    [0, "14:30", "Nina", "Hidratação", "agendado"],
    [0, "16:00", "Max", "Banho e tosa", "agendado"],
    [1, "09:00", "Amora", "Banho", "confirmado"],
    [1, "11:00", "Fred", "Banho e tosa", "agendado"],
    [1, "15:00", "Paçoca", "Banho", "agendado"],
    [2, "08:30", "Thor", "Hidratação", "agendado"],
    [2, "10:00", "Luna", "Banho", "agendado"],
    [3, "14:00", "Bob", "Banho e tosa", "agendado"],
  ];
  const duracao: Record<string, number> = { Banho: 60, "Banho e tosa": 90, Hidratação: 30 };
  const linhas = AGENDA.map(([dia, hora, nomePet, nomeServico, status]) => {
    let d = hoje.plus({ days: dia });
    if (d.weekday === 7) d = d.plus({ days: 1 }); // domingo fechado
    const [h, m] = hora.split(":").map(Number);
    const inicio = d.set({ hour: h, minute: m });
    return {
      petshop_id: pid,
      pet_id: pet(nomePet),
      servico_id: servico(nomeServico),
      inicio: inicio.toISO(),
      fim: inicio.plus({ minutes: duracao[nomeServico] }).toISO(),
      status,
      avisos: { lembretes: [] }, // sem lembrete automático pros números fictícios
    };
  });
  ok(await admin.from("agendamentos").insert(linhas).select("id"), "os agendamentos");

  const login = { email: DEMO_EMAIL, senha };
  writeFileSync(ARQUIVO_LOGIN, JSON.stringify(login, null, 2));
  return login;
}

export async function apagarDemo() {
  const admin = db();
  await apagarPetshop(admin);
  const userId = await acharUsuario(admin, DEMO_EMAIL);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

if (require.main === module) {
  (async () => {
    if (process.argv.includes("--apagar")) {
      await apagarDemo();
      console.log("Petshop e usuário de demonstração apagados.");
      return;
    }
    const login = await recriarDemo();
    console.log(`Petshop de demonstração pronto. Login: ${login.email} (senha em scripts/tutoriais/.demo.json)`);
  })().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
