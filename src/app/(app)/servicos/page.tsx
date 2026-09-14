import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { competenciaDe, intervaloCompetencia } from "@/lib/fechamento/calcular";
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
    .select("id, nome, duracao_min, preco_centavos, preco_pequeno_centavos, preco_medio_centavos, preco_grande_centavos", { count: "exact" })
    .eq("ativo", true)
    .order("nome")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    query = query.ilike("nome", `%${q.replace(/[,()]/g, "")}%`);
  }

  const { inicio, fim } = intervaloCompetencia(competenciaDe());

  const [{ data: servicos, count, error }, { data: planos }, { data: agsMes }] = await Promise.all([
    query,
    supabase.from("planos").select("servico_id").eq("ativo", true),
    supabase
      .from("agendamentos")
      .select("servico_id")
      .neq("status", "cancelado")
      .gte("inicio", inicio)
      .lt("inicio", fim),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  if (page > totalPages) {
    redirect(`/servicos?${new URLSearchParams({ ...(q ? { q } : {}), page: String(totalPages) })}`);
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Serviços" />
        <p className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Não foi possível carregar os serviços. Recarregue a página.
        </p>
      </div>
    );
  }

  const planosPorServico = new Map<string, number>();
  for (const p of planos ?? []) {
    planosPorServico.set(p.servico_id, (planosPorServico.get(p.servico_id) ?? 0) + 1);
  }
  const agsPorServico = new Map<string, number>();
  for (const a of agsMes ?? []) {
    agsPorServico.set(a.servico_id, (agsPorServico.get(a.servico_id) ?? 0) + 1);
  }

  return (
    <ServicosTable
      servicos={(servicos ?? []).map((s) => ({
        ...s,
        planosQueUsam: planosPorServico.get(s.id) ?? 0,
        atendimentosMes: agsPorServico.get(s.id) ?? 0,
      }))}
      busca={q}
      page={page}
      totalPages={totalPages}
      total={count ?? 0}
    />
  );
}
