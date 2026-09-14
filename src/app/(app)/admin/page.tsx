import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { AdminView, type ContaAdmin } from "./AdminView";

export const metadata = { title: "Admin · BubblePet" };

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Pra quem não é admin, a página nem existe.
  if (!user || !ehAdmin(user.email)) notFound();

  const db = createAdminClient();
  const desde = DateTime.now().minus({ days: 30 }).toISO()!;

  const [{ data: petshops }, { data: perfis }, { data: tutores }, { data: agendamentos }, usuarios] =
    await Promise.all([
      db
        .from("petshops")
        .select("id, nome, slug, telefone, status, congelado_em, criado_em, whatsapp_status")
        .order("criado_em", { ascending: false }),
      db.from("perfis").select("id, nome, petshop_id, role"),
      db.from("tutores").select("petshop_id").eq("ativo", true),
      db.from("agendamentos").select("petshop_id").gte("inicio", desde).neq("status", "cancelado"),
      db.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  const usuarioPorId = new Map(
    (usuarios.data?.users ?? []).map((u) => [u.id, { email: u.email ?? "", ultimoAcesso: u.last_sign_in_at ?? null }])
  );
  const contar = (rows: { petshop_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.petshop_id, (m.get(r.petshop_id) ?? 0) + 1);
    return m;
  };
  const clientesPor = contar(tutores);
  const agsPor = contar(agendamentos);

  const contas: ContaAdmin[] = (petshops ?? []).map((p) => {
    const equipe = (perfis ?? []).filter((pf) => pf.petshop_id === p.id);
    const dono = equipe.find((pf) => pf.role === "dono") ?? equipe[0];
    const acessos = equipe
      .map((pf) => usuarioPorId.get(pf.id)?.ultimoAcesso)
      .filter((d): d is string => !!d)
      .sort();
    return {
      id: p.id,
      nome: p.nome,
      slug: p.slug,
      telefone: p.telefone,
      status: p.status as "ativo" | "congelado",
      congeladoEm: p.congelado_em,
      criadoEm: p.criado_em,
      whatsappConectado: p.whatsapp_status === "conectado",
      donoNome: dono?.nome ?? "—",
      donoEmail: dono ? (usuarioPorId.get(dono.id)?.email ?? "") : "",
      usuarios: equipe.length,
      ultimoAcesso: acessos.at(-1) ?? null,
      clientes: clientesPor.get(p.id) ?? 0,
      agendamentos30d: agsPor.get(p.id) ?? 0,
    };
  });

  return <AdminView contas={contas} />;
}
