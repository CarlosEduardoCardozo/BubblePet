import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { lerSuporte } from "@/lib/suporte";
import { AdminView, type ContaAdmin, type SituacaoUso } from "./AdminView";

export const metadata = { title: "Admin · BubblePet" };

function contar(rows: { petshop_id: string }[] | null) {
  const m = new Map<string, number>();
  for (const r of rows ?? []) m.set(r.petshop_id, (m.get(r.petshop_id) ?? 0) + 1);
  return m;
}

function situacao(ultimoUso: string | null, atividade7d: number): SituacaoUso {
  if (!ultimoUso && atividade7d === 0) return "nunca";
  const dias = ultimoUso ? DateTime.now().diff(DateTime.fromISO(ultimoUso), "days").days : Infinity;
  if (dias <= 3 || atividade7d > 0) return "usando";
  if (dias <= 14) return "pouco";
  return "parado";
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Pra quem não é admin (ou está em modo suporte), a página nem existe.
  if (!user || !ehAdmin(user.email) || (await lerSuporte(user.id))) notFound();

  const db = createAdminClient();
  const agora = DateTime.now();
  const desde30 = agora.minus({ days: 30 }).toISO()!;
  const desde7 = agora.minus({ days: 7 }).toISO()!;

  const [
    { data: petshops },
    { data: perfis },
    { data: tutores },
    { data: agendamentos30 },
    { data: criados7 },
    { data: mensagens30 },
    { data: suportes },
    usuarios,
  ] = await Promise.all([
    db
      .from("petshops")
      .select("id, nome, slug, telefone, status, congelado_em, criado_em, whatsapp_status")
      .order("criado_em", { ascending: false }),
    db.from("perfis").select("id, nome, petshop_id, role, ativo, ultimo_uso_em").order("criado_em"),
    db.from("tutores").select("petshop_id").eq("ativo", true),
    db.from("agendamentos").select("petshop_id").gte("inicio", desde30).neq("status", "cancelado"),
    db.from("agendamentos").select("petshop_id").gte("criado_em", desde7),
    db.from("mensagens_whatsapp").select("petshop_id").gte("criado_em", desde30).eq("status", "enviada"),
    db.from("acessos_suporte").select("petshop_id, inicio").order("inicio", { ascending: false }).limit(200),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const usuarioPorId = new Map(
    (usuarios.data?.users ?? []).map((u) => [u.id, { email: u.email ?? "", login: u.last_sign_in_at ?? null }])
  );
  const clientesPor = contar(tutores);
  const agsPor = contar(agendamentos30);
  const criadosPor = contar(criados7);
  const msgsPor = contar(mensagens30);
  const ultimoSuportePor = new Map<string, string>();
  for (const s of suportes ?? []) {
    if (s.petshop_id && !ultimoSuportePor.has(s.petshop_id)) ultimoSuportePor.set(s.petshop_id, s.inicio);
  }

  const contas: ContaAdmin[] = (petshops ?? []).map((p) => {
    const equipe = (perfis ?? [])
      .filter((pf) => pf.petshop_id === p.id)
      .map((pf) => ({
        id: pf.id,
        nome: pf.nome,
        email: usuarioPorId.get(pf.id)?.email ?? "",
        dono: pf.role === "dono",
        ativo: pf.ativo,
        // Uso real registrado pelo painel; login do Auth só como reserva
        // (entrar pelo suporte também conta como login lá).
        ultimoUso: pf.ultimo_uso_em ?? usuarioPorId.get(pf.id)?.login ?? null,
        admin: ehAdmin(usuarioPorId.get(pf.id)?.email),
      }))
      .sort((a, b) => Number(b.dono) - Number(a.dono));
    const ultimoUso = equipe.map((u) => u.ultimoUso).filter((d): d is string => !!d).sort().at(-1) ?? null;
    const atividade7d = criadosPor.get(p.id) ?? 0;
    return {
      id: p.id,
      nome: p.nome,
      slug: p.slug,
      status: p.status as "ativo" | "congelado",
      criadoEm: p.criado_em,
      whatsappConectado: p.whatsapp_status === "conectado",
      usuarios: equipe,
      ultimoUso,
      situacao: situacao(ultimoUso, atividade7d),
      clientes: clientesPor.get(p.id) ?? 0,
      agendamentos30d: agsPor.get(p.id) ?? 0,
      agendamentosCriados7d: atividade7d,
      mensagens30d: msgsPor.get(p.id) ?? 0,
      ultimoSuporte: ultimoSuportePor.get(p.id) ?? null,
    };
  });

  return <AdminView contas={contas} />;
}
