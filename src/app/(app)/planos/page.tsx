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

  // Sem !inner: assim planos sem nenhum assinante continuam aparecendo com 0
  // em vez de sumir da lista. Agrupo em memória em vez de N+1 queries.
  const { data: assinaturasAtivas } = await supabase
    .from("assinaturas")
    .select("plano_id")
    .eq("status", "ativa");

  const assinantesPorPlano: Record<string, number> = {};
  for (const row of assinaturasAtivas ?? []) {
    assinantesPorPlano[row.plano_id] = (assinantesPorPlano[row.plano_id] ?? 0) + 1;
  }

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
      assinantesPorPlano={assinantesPorPlano}
    />
  );
}
