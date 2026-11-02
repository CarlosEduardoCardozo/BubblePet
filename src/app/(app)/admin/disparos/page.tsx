import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAdminPagina } from "@/lib/admin-acesso";
import { carregarConfigPlataforma, statusDaPlataforma } from "@/lib/plataforma";
import { DisparosView, type DisparoLinha } from "./DisparosView";

export const metadata = { title: "Disparos · Admin · BubblePet" };
export const dynamic = "force-dynamic";

export default async function DisparosPage() {
  await exigirAdminPagina();
  const config = await carregarConfigPlataforma();
  const [{ data }, status] = await Promise.all([
    createAdminClient().from("disparos").select("*").order("criado_em", { ascending: false }).limit(50),
    statusDaPlataforma(config),
  ]);
  const disparos: DisparoLinha[] = (data ?? []).map((d) => ({
    id: d.id,
    nome: d.nome,
    texto: d.texto,
    status: d.status,
    total: d.total,
    enviados: d.enviados,
    erros: d.erros,
    criadoEm: d.criado_em,
  }));
  return <DisparosView disparos={disparos} porHora={config.disparoPorHora} pronto={status.configurado && status.conectado} configurado={status.configurado} />;
}
