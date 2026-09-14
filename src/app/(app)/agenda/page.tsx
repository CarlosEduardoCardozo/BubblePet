import { createClient } from "@/lib/supabase/server";
import { AgendaView } from "@/components/agenda/AgendaView";
import { horarioDoPetshop } from "@/lib/agenda/slots";

export default async function AgendaPage() {
  const supabase = await createClient();

  const [{ data: pets }, { data: tutores }, { data: servicos }, { data: petshop }] = await Promise.all([
    supabase
      .from("pets")
      .select("id, nome, porte, tutor_id, tutores!inner(nome, ativo)")
      .eq("ativo", true)
      .eq("tutores.ativo", true)
      .order("nome"),
    supabase.from("tutores").select("id, nome, telefone").eq("ativo", true).order("nome"),
    supabase
      .from("servicos")
      .select("id, nome, duracao_min, preco_centavos, preco_pequeno_centavos, preco_medio_centavos, preco_grande_centavos")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("petshops")
      .select("horario_abertura, horario_fechamento, dias_funcionamento, horario_semana, capacidade_por_horario, whatsapp_status")
      .single(),
  ]);

  const horario = horarioDoPetshop(petshop);

  return (
    <AgendaView
      pets={(pets ?? []).map((pet) => ({
        id: pet.id,
        nome: pet.nome,
        porte: pet.porte,
        tutorId: pet.tutor_id,
        tutorNome: (pet.tutores as unknown as { nome: string } | null)?.nome ?? "",
      }))}
      tutores={tutores ?? []}
      servicos={servicos ?? []}
      horario={horario}
      whatsappConectado={petshop?.whatsapp_status === "conectado"}
    />
  );
}
