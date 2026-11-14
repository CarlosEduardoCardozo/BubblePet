import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import type { Caixa, MetodoPagamento } from "@/lib/pagamentos";
import { CaixasCard } from "./CaixasCard";
import { MetodosCard } from "./MetodosCard";

type MetodoRow = Omit<MetodoPagamento, "taxas" | "taxa_fixa_valor"> & {
  taxa_fixa_valor: number | string | null;
  metodo_taxas_parcela: { parcelas: number; percentual: number | string }[] | null;
};

export default async function PagamentosPage() {
  const supabase = await createClient();

  const [{ data: petshop, error: erroPetshop }, { data: caixas, error: erroCaixas }, { data: metodos, error: erroMetodos }] =
    await Promise.all([
      supabase.from("petshops").select("usa_varios_caixas").single(),
      supabase
        .from("caixas")
        .select("id, nome, tipo, principal, ativo")
        .order("principal", { ascending: false })
        .order("nome"),
      supabase
        .from("metodos_pagamento")
        .select(
          "id, descricao, tipo, bandeira, ativo, caixa_id, taxa_fixa_tipo, taxa_fixa_valor, prazo_modo, prazo_dias, parcelado_modo, max_parcelas, sistema, metodo_taxas_parcela(parcelas, percentual)"
        )
        .order("sistema", { ascending: false })
        .order("descricao"),
    ]);

  if (erroPetshop || erroCaixas || erroMetodos || !petshop) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Pagamentos" />
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Não foi possível carregar os pagamentos. Recarregue a página.
        </p>
      </div>
    );
  }

  // numeric volta como string do PostgREST em alguns casos: normaliza.
  const metodosTela: MetodoPagamento[] = ((metodos ?? []) as unknown as MetodoRow[]).map((m) => ({
    ...m,
    taxa_fixa_valor: m.taxa_fixa_valor === null ? null : Number(m.taxa_fixa_valor),
    taxas: (m.metodo_taxas_parcela ?? [])
      .map((t) => ({ parcelas: t.parcelas, percentual: Number(t.percentual) }))
      .sort((a, b) => a.parcelas - b.parcelas),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pagamentos"
        description="Caixas e métodos de pagamento, com as taxas e o prazo de recebimento de cada um."
      />
      <CaixasCard caixas={(caixas ?? []) as Caixa[]} usaVarios={petshop.usa_varios_caixas} />
      <MetodosCard
        metodos={metodosTela}
        caixas={(caixas ?? []) as Caixa[]}
        usaVariosCaixas={petshop.usa_varios_caixas}
      />
    </div>
  );
}
