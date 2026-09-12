import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { TutoresTable, type Tutor } from "./TutoresTable";

const PAGE_SIZE = 20;

export default async function TutoresPetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  let query = supabase
    .from("tutores")
    .select(
      "id, nome, telefone, email, cpf, observacoes, pets(id, nome, especie, raca, porte, nascimento, observacoes, ativo, assinaturas(status, planos(nome)))",
      { count: "exact" }
    )
    .eq("ativo", true)
    .order("nome")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    // Busca por nome ou telefone. Vírgula/parênteses quebrariam a sintaxe do
    // .or() do PostgREST, então só o que interessa passa.
    const texto = q.replace(/[,()]/g, "").trim();
    const digitos = q.replace(/\D/g, "");
    const filtros = [`nome.ilike.%${texto}%`];
    if (digitos.length >= 3) filtros.push(`telefone.ilike.%${digitos}%`);
    query = query.or(filtros.join(","));
  }

  const [{ data: tutores, count, error }, { count: totalPets }] = await Promise.all([
    query,
    supabase.from("pets").select("id", { count: "exact", head: true }).eq("ativo", true),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  if (page > totalPages) {
    // Ex.: removeu o último cliente da última página.
    redirect(`/tutores-pets?${new URLSearchParams({ ...(q ? { q } : {}), page: String(totalPages) })}`);
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Clientes e pets" />
        <p className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Não foi possível carregar os clientes. Recarregue a página.
        </p>
      </div>
    );
  }

  const lista = (tutores ?? []) as unknown as Tutor[];

  // Próximo atendimento de cada cliente da página (uma query só).
  const petIds = lista.flatMap((t) => t.pets.map((p) => p.id));
  const proximoPorTutor = new Map<string, string>();
  if (petIds.length > 0) {
    const { data: proximos } = await supabase
      .from("agendamentos")
      .select("inicio, pet_id, pets(tutor_id)")
      .in("pet_id", petIds)
      .in("status", ["agendado", "confirmado"])
      .gte("inicio", new Date().toISOString())
      .order("inicio");
    for (const row of proximos ?? []) {
      const pet = row.pets as unknown as { tutor_id: string } | { tutor_id: string }[] | null;
      const tutorId = Array.isArray(pet) ? pet[0]?.tutor_id : pet?.tutor_id;
      if (tutorId && !proximoPorTutor.has(tutorId)) proximoPorTutor.set(tutorId, row.inicio);
    }
  }

  const { data: planos } = await supabase
    .from("planos")
    .select("id, nome, creditos_mes")
    .eq("ativo", true)
    .order("nome");

  return (
    <TutoresTable
      tutores={lista.map((t) => ({ ...t, proximoAgendamento: proximoPorTutor.get(t.id) ?? null }))}
      totalTutores={count ?? 0}
      totalPets={totalPets ?? 0}
      busca={q}
      page={page}
      totalPages={totalPages}
      planos={planos ?? []}
    />
  );
}
