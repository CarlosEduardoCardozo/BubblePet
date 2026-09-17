import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
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
      "id, nome, creditos_mes, preco_centavos, permite_acumular, servico_id, servicos(nome, ativo)",
      { count: "exact" }
    )
    .eq("ativo", true)
    .order("nome")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    query = query.ilike("nome", `%${q.replace(/[,()]/g, "")}%`);
  }

  const [{ data: planos, count, error }, { data: servicos }, { data: assinaturasAtivas }] =
    await Promise.all([
      query,
      supabase.from("servicos").select("id, nome, duracao_min").eq("ativo", true).order("nome"),
      // Sem !inner: planos sem assinante continuam aparecendo com 0.
      supabase.from("assinaturas").select("plano_id, preco_centavos, planos(preco_centavos)").eq("status", "ativa"),
    ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  if (page > totalPages) {
    redirect(`/planos?${new URLSearchParams({ ...(q ? { q } : {}), page: String(totalPages) })}`);
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Planos" />
        <p className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Não foi possível carregar os planos. Recarregue a página.
        </p>
      </div>
    );
  }

  const assinantesPorPlano: Record<string, number> = {};
  const receitaPorPlano: Record<string, number> = {};
  let receitaRecorrente = 0;
  for (const row of assinaturasAtivas ?? []) {
    assinantesPorPlano[row.plano_id] = (assinantesPorPlano[row.plano_id] ?? 0) + 1;
    const plano = row.planos as unknown as { preco_centavos: number } | { preco_centavos: number }[] | null;
    const preco = Array.isArray(plano) ? plano[0]?.preco_centavos : plano?.preco_centavos;
    // Valor combinado com o pet vale mais que o preço base do plano.
    receitaRecorrente += row.preco_centavos ?? preco ?? 0;
    receitaPorPlano[row.plano_id] = (receitaPorPlano[row.plano_id] ?? 0) + (row.preco_centavos ?? preco ?? 0);
  }

  return (
    <PlanosTable
      planos={(planos ?? []).map((plano) => {
        const servico = plano.servicos as unknown as { nome: string; ativo: boolean } | null;
        return {
          id: plano.id,
          nome: plano.nome,
          creditos_mes: plano.creditos_mes,
          preco_centavos: plano.preco_centavos,
          permite_acumular: plano.permite_acumular,
          servico_id: plano.servico_id,
          servicoNome: servico?.ativo ? servico.nome : "",
        };
      })}
      busca={q}
      page={page}
      totalPages={totalPages}
      servicos={servicos ?? []}
      assinantesPorPlano={assinantesPorPlano}
      receitaPorPlano={receitaPorPlano}
      receitaRecorrenteCentavos={receitaRecorrente}
      totalPlanos={count ?? 0}
    />
  );
}
