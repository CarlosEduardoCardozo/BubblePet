import { createClient } from "@/lib/supabase/server";
import { TutoresTable } from "./TutoresTable";

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
      "id, nome, telefone, email, cpf, observacoes, pets(id, nome, especie, raca, porte, nascimento, observacoes, ativo)",
      { count: "exact" }
    )
    .order("nome")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    query = query.ilike("nome", `%${q}%`);
  }

  const { data: tutores, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const { data: planos } = await supabase
    .from("planos")
    .select("id, nome, creditos_mes")
    .eq("ativo", true)
    .order("nome");

  return (
    <TutoresTable
      tutores={tutores ?? []}
      page={page}
      totalPages={totalPages}
      planos={planos ?? []}
    />
  );
}
