import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAdminPagina } from "@/lib/admin-acesso";
import { statusDaPlataforma } from "@/lib/plataforma";
import type { Lead } from "@/lib/leads";
import { LeadsView } from "./LeadsView";

export const metadata = { title: "Leads · Admin · BubblePet" };
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  await exigirAdminPagina();
  const [{ data }, plataforma] = await Promise.all([
    createAdminClient().from("leads").select("*").order("criado_em", { ascending: false }).limit(1000),
    statusDaPlataforma(),
  ]);
  const leads: Lead[] = (data ?? []).map((l) => ({
    id: l.id,
    nome: l.nome,
    telefone: l.telefone,
    email: l.email,
    petshopNome: l.petshop_nome,
    origem: l.origem,
    etapa: l.etapa,
    observacoes: l.observacoes,
    optout: l.optout,
    petshopId: l.petshop_id,
    ultimoContatoEm: l.ultimo_contato_em,
    criadoEm: l.criado_em,
  }));
  return <LeadsView leads={leads} whatsappPronto={plataforma.configurado && plataforma.conectado} />;
}
