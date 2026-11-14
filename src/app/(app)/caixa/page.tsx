import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { hojeISO } from "@/lib/lancamentos";
import type { Caixa, MetodoPagamento } from "@/lib/pagamentos";
import { CaixaView, type LancamentoRow } from "./CaixaView";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

type LancRow = {
  id: string;
  tipo: "entrada" | "saida";
  descricao: string | null;
  valor_bruto_centavos: number;
  taxa_centavos: number;
  valor_liquido_centavos: number;
  status: "previsto" | "realizado" | "cancelado";
  data_prevista: string;
  data_recebimento: string | null;
  parcela_numero: number;
  parcelas_total: number;
  origem: string;
  caixa_id: string;
  metodos_pagamento: Um<{ descricao: string; tipo: string }>;
  categorias_financeiras: Um<{ nome: string }>;
  caixas: Um<{ nome: string }>;
};

type MetodoRow = Omit<MetodoPagamento, "taxas" | "taxa_fixa_valor"> & {
  taxa_fixa_valor: number | string | null;
  metodo_taxas_parcela: { parcelas: number; percentual: number | string }[] | null;
};

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; caixa?: string }>;
}) {
  const { data: dataParam, caixa: caixaParam } = await searchParams;
  const hoje = hojeISO();
  const data =
    dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam) && DateTime.fromISO(dataParam).isValid ? dataParam : hoje;
  const caixaFiltro = caixaParam && /^[0-9a-f-]{36}$/i.test(caixaParam) ? caixaParam : null;

  const supabase = await createClient();

  let lancQuery = supabase
    .from("lancamentos")
    .select(
      "id, tipo, descricao, valor_bruto_centavos, taxa_centavos, valor_liquido_centavos, status, data_prevista, data_recebimento, parcela_numero, parcelas_total, origem, caixa_id, metodos_pagamento(descricao, tipo), categorias_financeiras(nome), caixas(nome)"
    )
    .eq("data_lancamento", data)
    .neq("status", "cancelado")
    .order("criado_em", { ascending: false });
  if (caixaFiltro) lancQuery = lancQuery.eq("caixa_id", caixaFiltro);

  const [
    { data: petshop, error: erroPetshop },
    { data: lancamentos, error: erroLanc },
    { data: caixas },
    { data: metodos },
    { data: categorias },
  ] = await Promise.all([
    supabase.from("petshops").select("usa_varios_caixas").single(),
    lancQuery,
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
      .eq("ativo", true)
      .order("sistema", { ascending: false })
      .order("descricao"),
    supabase.from("categorias_financeiras").select("id, nome, tipo").eq("ativa", true).order("nome"),
  ]);

  if (erroPetshop || erroLanc || !petshop) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Caixa" />
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Não foi possível carregar o caixa. Recarregue a página.
        </p>
      </div>
    );
  }

  const rows: LancamentoRow[] = ((lancamentos ?? []) as unknown as LancRow[]).map((l) => ({
    id: l.id,
    tipo: l.tipo,
    descricao: l.descricao,
    categoria: um(l.categorias_financeiras)?.nome ?? null,
    metodo: um(l.metodos_pagamento)?.descricao ?? null,
    metodoTipo: um(l.metodos_pagamento)?.tipo ?? null,
    caixa: um(l.caixas)?.nome ?? null,
    brutoCentavos: l.valor_bruto_centavos,
    taxaCentavos: l.taxa_centavos,
    liquidoCentavos: l.valor_liquido_centavos,
    status: l.status === "realizado" ? "realizado" : "previsto",
    dataPrevista: l.data_prevista,
    dataRecebimento: l.data_recebimento,
    parcelaNumero: l.parcela_numero,
    parcelasTotal: l.parcelas_total,
    origem: l.origem,
  }));

  const metodosTela: MetodoPagamento[] = ((metodos ?? []) as unknown as MetodoRow[]).map((m) => ({
    ...m,
    taxa_fixa_valor: m.taxa_fixa_valor === null ? null : Number(m.taxa_fixa_valor),
    taxas: (m.metodo_taxas_parcela ?? [])
      .map((t) => ({ parcelas: t.parcelas, percentual: Number(t.percentual) }))
      .sort((a, b) => a.parcelas - b.parcelas),
  }));

  return (
    <CaixaView
      data={data}
      hoje={hoje}
      caixaFiltro={caixaFiltro}
      lancamentos={rows}
      metodos={metodosTela}
      caixas={(caixas ?? []) as Caixa[]}
      categorias={(categorias ?? []) as { id: string; nome: string; tipo: "entrada" | "saida" }[]}
      usaVariosCaixas={petshop.usa_varios_caixas}
    />
  );
}
