import { createClient } from "@/lib/supabase/server";
import { PlanosTable } from "./PlanosTable";

const PAGE_SIZE = 20;

export default async function PlanosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  let query = supabase
    .from("planos")
    .select(
      "id, nome, creditos_mes, preco_centavos, permite_acumular, servico_id, servicos(nome)",
      { count: "exact" }
    )
    .eq("ativo", true)
    .order("nome")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    query = query.ilike("nome", `%${q}%`);
  }

  const { data: planos, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const { data: servicos } = await supabase
    .from("servicos")
    .select("id, nome, duracao_min")
    .eq("ativo", true)
    .order("nome");

  return (
    <PlanosTable
      planos={(planos ?? []).map((plano) => ({
        id: plano.id,
        nome: plano.nome,
        creditos_mes: plano.creditos_mes,
        preco_centavos: plano.preco_centavos,
        permite_acumular: plano.permite_acumular,
        servico_id: plano.servico_id,
        servicoNome:
          (plano.servicos as unknown as { nome: string } | null)?.nome ?? "",
      }))}
      page={page}
      totalPages={totalPages}
      servicos={servicos ?? []}
    />
  );
}
