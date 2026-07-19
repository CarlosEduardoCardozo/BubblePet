import { createClient } from "@/lib/supabase/server";
import { AgendaView } from "@/components/agenda/AgendaView";

export default async function AgendaPage() {
  const supabase = await createClient();

  const [{ data: pets }, { data: servicos }] = await Promise.all([
    supabase
      .from("pets")
      .select("id, nome, tutores(nome)")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("servicos")
      .select("id, nome, duracao_min")
      .eq("ativo", true)
      .order("nome"),
  ]);

  return (
    <AgendaView
      pets={(pets ?? []).map((pet) => ({
        id: pet.id,
        nome: pet.nome,
        tutorNome: (pet.tutores as unknown as { nome: string } | null)?.nome ?? "",
      }))}
      servicos={servicos ?? []}
    />
  );
}
