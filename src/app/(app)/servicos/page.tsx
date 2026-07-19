import { createClient } from "@/lib/supabase/server";
import { ServicosTable } from "./ServicosTable";

const PAGE_SIZE = 20;

export default async function ServicosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  let query = supabase
    .from("servicos")
    .select("id, nome, duracao_min, preco_centavos", { count: "exact" })
    .eq("ativo", true)
    .order("nome")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    query = query.ilike("nome", `%${q}%`);
  }

  const { data: servicos, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <ServicosTable
      servicos={servicos ?? []}
      page={page}
      totalPages={totalPages}
    />
  );
}
