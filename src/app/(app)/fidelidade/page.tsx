import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { carregarCartoes, carregarConfigFidelidade } from "@/lib/fidelidade-carregar";
import { FidelidadeView, type LinhaCartao } from "./FidelidadeView";

export const metadata = { title: "Fidelidade · BubblePet" };

export default async function FidelidadePage() {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const config = await carregarConfigFidelidade(supabase, petshopId);
  const desde30 = DateTime.now().minus({ days: 30 }).toUTC().toISO()!;

  const [cartoes, tutoresRes, servicosRes, avisosRes, petshopRes] = await Promise.all([
    carregarCartoes(supabase, petshopId, config).catch(() => null),
    supabase.from("tutores").select("id, nome, telefone, pets(nome)").eq("petshop_id", petshopId).eq("ativo", true),
    supabase.from("servicos").select("id, nome").eq("petshop_id", petshopId).eq("ativo", true).order("nome"),
    supabase.from("fidelidade_avisos").select("id", { count: "exact", head: true }).eq("petshop_id", petshopId).eq("status", "enviado").gte("criado_em", desde30),
    supabase.from("petshops").select("whatsapp_status").eq("id", petshopId).single(),
  ]);

  const linhas: LinhaCartao[] = [];
  for (const t of tutoresRes.data ?? []) {
    const c = cartoes?.get(t.id);
    if (!c) continue;
    linhas.push({
      tutorId: t.id,
      tutorNome: t.nome,
      pets: ((t.pets as { nome: string }[] | null) ?? []).map((p) => p.nome),
      carimbos: c.carimbos,
      progresso: c.progresso,
      faltam: c.faltam,
      disponiveis: c.disponiveis,
      usados: c.usados,
      ultimoCarimbo: c.ultimoCarimbo,
    });
  }

  return (
    <FidelidadeView
      config={config}
      linhas={linhas}
      servicos={servicosRes.data ?? []}
      avisosEnviados={avisosRes.count ?? 0}
      whatsappConectado={petshopRes.data?.whatsapp_status === "conectado"}
      erro={cartoes === null}
    />
  );
}
