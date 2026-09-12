import { createClient } from "@/lib/supabase/server";
import { AgendaView } from "@/components/agenda/AgendaView";
import { HORARIO_PADRAO, type HorarioFuncionamento } from "@/lib/agenda/slots";

export default async function AgendaPage() {
  const supabase = await createClient();

  const [{ data: pets }, { data: servicos }, { data: petshop }] = await Promise.all([
    supabase
      .from("pets")
      .select("id, nome, tutores!inner(nome, ativo)")
      .eq("ativo", true)
      .eq("tutores.ativo", true)
      .order("nome"),
    supabase
      .from("servicos")
      .select("id, nome, duracao_min, preco_centavos")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("petshops")
      .select("horario_abertura, horario_fechamento, dias_funcionamento")
      .single(),
  ]);

  const horario: HorarioFuncionamento = petshop
    ? {
        abertura: String(petshop.horario_abertura).slice(0, 5),
        fechamento: String(petshop.horario_fechamento).slice(0, 5),
        dias: petshop.dias_funcionamento ?? HORARIO_PADRAO.dias,
      }
    : HORARIO_PADRAO;

  return (
    <AgendaView
      pets={(pets ?? []).map((pet) => ({
        id: pet.id,
        nome: pet.nome,
        tutorNome: (pet.tutores as unknown as { nome: string } | null)?.nome ?? "",
      }))}
      servicos={servicos ?? []}
      horario={horario}
    />
  );
}
