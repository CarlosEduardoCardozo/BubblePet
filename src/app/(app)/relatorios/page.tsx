import Link from "next/link";
import { CalendarCheck, CalendarX, Repeat, TrendingUp, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { formatCentavos } from "@/lib/currency";
import { carregarRelatorioAvancado } from "@/lib/relatorios/avancado";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { BarrasHorizontais, COR_AMBAR, COR_ROXO, GraficoColunas } from "./graficos";

export const dynamic = "force-dynamic";

const PERIODOS = [3, 6, 12] as const;

function Cartao({ titulo, descricao, children, className }: { titulo: string; descricao?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("glass flex min-w-0 flex-col gap-4 rounded-card p-5", className)}>
      <div>
        <h2 className="text-[15px] font-bold">{titulo}</h2>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

function Numero({ icon: Icon, titulo, valor, dica, destaque = false, href }: {
  icon: React.ElementType;
  titulo: string;
  valor: string;
  dica: string;
  destaque?: boolean;
  href?: string;
}) {
  const conteudo = (
    <div className={cn("flex h-full flex-col gap-3 rounded-card p-5", destaque ? "bg-brand" : "glass")}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{titulo}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-full", destaque ? "bg-white/20" : "bg-secondary text-primary")}>
          <Icon size={16} />
        </span>
      </div>
      <div className="text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl">{valor}</div>
      <div className={cn("text-xs font-medium", destaque ? "text-white/80" : "text-muted-foreground")}>{dica}</div>
    </div>
  );
  return href ? <Link href={href}>{conteudo}</Link> : conteudo;
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ meses?: string }> }) {
  const { meses: mesesRaw } = await searchParams;
  const pedido = Number(mesesRaw);
  const quantidade = (PERIODOS as readonly number[]).includes(pedido) ? pedido : 6;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const r = await carregarRelatorioAvancado(supabase, petshopId, quantidade);

  const semDados = r.totais.atendimentos === 0 && r.totais.movimentoCentavos === 0;
  const atendimentosTotais = r.totais.atendimentos + r.totais.faltas + r.totais.cancelados;
  const taxaPerdas = atendimentosTotais > 0 ? Math.round(((r.totais.faltas + r.totais.cancelados) / atendimentosTotais) * 100) : 0;
  const periodoTexto = `últimos ${quantidade} meses`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Relatórios" description="Como o petshop está indo mês a mês: movimento, clientes, agenda e serviços." />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={`/relatorios?meses=${p}`}
            aria-current={p === quantidade ? "true" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              p === quantidade ? "bg-brand" : "glass text-muted-foreground hover:text-foreground"
            )}
          >
            {p} meses
          </Link>
        ))}
      </div>

      {semDados ? (
        <EmptyState icon={TrendingUp} title="Ainda sem dados neste período" description="Os gráficos aparecem conforme os atendimentos acontecem." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            <Numero icon={TrendingUp} titulo="Movimento" valor={formatCentavos(r.totais.movimentoCentavos)} dica={periodoTexto} destaque />
            <Numero icon={CalendarCheck} titulo="Atendimentos" valor={String(r.totais.atendimentos)} dica={`${r.totais.clientes} clientes diferentes`} />
            <Numero
              icon={Repeat}
              titulo="Clientes que voltam"
              valor={r.totais.retencaoMediaPct != null ? `${r.totais.retencaoMediaPct}%` : "—"}
              dica="média dos meses fechados"
            />
            <Numero
              icon={Users}
              titulo="Ticket por cliente"
              valor={r.totais.clientes > 0 ? formatCentavos(Math.round(r.totais.movimentoCentavos / r.totais.clientes)) : "—"}
              dica="movimento ÷ clientes atendidos"
            />
            <Numero
              icon={CalendarX}
              titulo="Faltas e cancelamentos"
              valor={String(r.totais.faltas + r.totais.cancelados)}
              dica={`${taxaPerdas}% da agenda · ${r.totais.faltas} faltas, ${r.totais.cancelados} cancelados`}
            />
            <Numero
              icon={UserPlus}
              titulo="Para chamar de volta"
              valor={String(r.clientesParaChamar)}
              dica="clientes sumidos · ver em Oportunidades"
              href="/oportunidades"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Cartao titulo="Movimento por mês" descricao="Tudo que o petshop faturou: mensalidades dos planos e atendimentos avulsos.">
              <GraficoColunas
                titulo="Movimento por mês"
                series={[
                  { nome: "Mensalidades", cor: COR_ROXO },
                  { nome: "Avulsos", cor: COR_AMBAR },
                ]}
                pontos={r.meses.map((m) => ({
                  rotulo: m.rotulo,
                  valores: [m.mensalidadesCentavos, m.avulsoCentavos],
                  parcial: m.parcial,
                  tabela: [m.rotulo, formatCentavos(m.mensalidadesCentavos), formatCentavos(m.avulsoCentavos), formatCentavos(m.movimentoCentavos)],
                }))}
                formato="reais"
                cabecalhoTabela={["Mês", "Mensalidades", "Avulsos", "Total"]}
              />
            </Cartao>

            <Cartao titulo="Atendimentos por mês" descricao="Banhos e serviços realizados, com os cobertos por plano separados.">
              <GraficoColunas
                titulo="Atendimentos por mês"
                series={[
                  { nome: "Pelo plano", cor: COR_ROXO },
                  { nome: "Avulsos", cor: COR_AMBAR },
                ]}
                pontos={r.meses.map((m) => ({
                  rotulo: m.rotulo,
                  valores: [m.atendimentosPlano, m.atendimentos - m.atendimentosPlano],
                  parcial: m.parcial,
                  tabela: [m.rotulo, String(m.atendimentosPlano), String(m.atendimentos - m.atendimentosPlano), String(m.atendimentos)],
                }))}
                formato="numero"
                cabecalhoTabela={["Mês", "Pelo plano", "Avulsos", "Total"]}
              />
            </Cartao>

            <Cartao titulo="Clientes que voltam" descricao="Dos clientes atendidos no mês anterior, quantos voltaram neste mês.">
              <GraficoColunas
                titulo="Retenção de clientes"
                series={[{ nome: "Voltaram", cor: COR_ROXO }]}
                pontos={r.meses.map((m) => ({
                  rotulo: m.rotulo,
                  valores: [m.retencaoPct ?? 0],
                  parcial: m.parcial,
                  extra: m.baseRetencao > 0 ? `${m.retidos} de ${m.baseRetencao} clientes do mês anterior` : "Sem mês anterior para comparar",
                  tabela: [m.rotulo, m.retencaoPct != null ? `${m.retencaoPct}%` : "—", m.baseRetencao > 0 ? `${m.retidos} de ${m.baseRetencao}` : "—"],
                }))}
                formato="percentual"
                cabecalhoTabela={["Mês", "Voltaram", "Clientes"]}
              />
            </Cartao>

            <Cartao titulo="Faltas e cancelamentos" descricao="Horários que ficaram vazios por falta do cliente ou cancelamento.">
              <GraficoColunas
                titulo="Faltas e cancelamentos por mês"
                series={[
                  { nome: "Faltas", cor: COR_ROXO },
                  { nome: "Cancelados", cor: COR_AMBAR },
                ]}
                pontos={r.meses.map((m) => ({
                  rotulo: m.rotulo,
                  valores: [m.faltas, m.cancelados],
                  parcial: m.parcial,
                  tabela: [m.rotulo, String(m.faltas), String(m.cancelados), String(m.faltas + m.cancelados)],
                }))}
                formato="numero"
                cabecalhoTabela={["Mês", "Faltas", "Cancelados", "Total"]}
              />
            </Cartao>

            <Cartao titulo="Dias mais cheios" descricao={`Atendimentos por dia da semana nos ${periodoTexto}. O dia mais cheio fica em destaque.`}>
              {(() => {
                const maior = Math.max(...r.porDiaSemana.map((d) => d.quantidade));
                return (
                  <GraficoColunas
                    titulo="Atendimentos por dia da semana"
                    series={[{ nome: "Atendimentos", cor: COR_ROXO }]}
                    pontos={r.porDiaSemana.map((d) => ({
                      rotulo: d.nome,
                      valores: [d.quantidade],
                      apagado: d.quantidade !== maior,
                      tabela: [d.nome, String(d.quantidade)],
                    }))}
                    formato="numero"
                    cabecalhoTabela={["Dia", "Atendimentos"]}
                  />
                );
              })()}
            </Cartao>

            <Cartao titulo="Serviços mais pedidos" descricao={`Quantidade de atendimentos por serviço nos ${periodoTexto}.`}>
              {r.porServico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum atendimento no período.</p>
              ) : (
                <BarrasHorizontais
                  itens={r.porServico.slice(0, 8).map((s) => ({
                    nome: s.nome,
                    valor: s.quantidade,
                    texto: `${s.quantidade}`,
                    extra: formatCentavos(s.valorCentavos),
                  }))}
                  cabecalhoTabela={["Serviço", "Atendimentos", "Valor"]}
                />
              )}
            </Cartao>
          </div>

          <Cartao titulo="Melhores clientes" descricao={`Quem mais movimentou nos ${periodoTexto}, somando mensalidades e atendimentos.`}>
            {r.topClientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cliente com atendimento no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 font-semibold">#</th>
                      <th className="py-2 font-semibold">Cliente</th>
                      <th className="py-2 text-right font-semibold">Atendimentos</th>
                      <th className="py-2 text-right font-semibold">Movimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.topClientes.map((c, i) => (
                      <tr key={c.nome + i} className="border-t border-border/70">
                        <td className="py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5 font-medium">{c.nome}</td>
                        <td className="py-2.5 text-right tabular-nums">{c.atendimentos}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{formatCentavos(c.movimentoCentavos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Cartao>
        </>
      )}
    </div>
  );
}
