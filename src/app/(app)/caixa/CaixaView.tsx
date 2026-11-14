"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Percent,
  Plus,
  RotateCcw,
  Scale,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormSelect } from "@/components/shared/FormSelect";
import { formatCentavos } from "@/lib/currency";
import { GRUPOS_RECEBIMENTO, grupoDoTipo, type Caixa, type MetodoPagamento } from "@/lib/pagamentos";
import { cn } from "@/lib/utils";
import { LancamentoDialog, type CategoriaOpcao } from "./LancamentoDialog";
import { cancelarLancamento, marcarRealizado } from "./actions";

export type LancamentoRow = {
  id: string;
  tipo: "entrada" | "saida";
  descricao: string | null;
  categoria: string | null;
  metodo: string | null;
  metodoTipo: string | null;
  caixa: string | null;
  brutoCentavos: number;
  taxaCentavos: number;
  liquidoCentavos: number;
  status: "previsto" | "realizado";
  dataPrevista: string;
  dataRecebimento: string | null;
  parcelaNumero: number;
  parcelasTotal: number;
  origem: string;
};

const TODOS_CAIXAS = "todos";

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tom,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tom?: "positivo" | "negativo";
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon size={16} className="text-primary" />
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-xl font-semibold tracking-tight",
            tom === "positivo" && "text-emerald-600",
            tom === "negativo" && "text-destructive"
          )}
        >
          {value}
        </div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function dataCurta(iso: string): string {
  return DateTime.fromISO(iso).toFormat("dd/LL");
}

function StatusLancamento({ l, hoje }: { l: LancamentoRow; hoje: string }) {
  if (l.status === "realizado") {
    return <Badge variant="secondary">{l.tipo === "entrada" ? "Recebido" : "Pago"}</Badge>;
  }
  if (l.tipo === "entrada") {
    return <Badge variant="outline">Cai em {dataCurta(l.dataPrevista)}</Badge>;
  }
  return l.dataPrevista < hoje ? (
    <Badge variant="destructive">Atrasada · {dataCurta(l.dataPrevista)}</Badge>
  ) : (
    <Badge variant="outline">A pagar · {dataCurta(l.dataPrevista)}</Badge>
  );
}

export function CaixaView({
  data,
  hoje,
  caixaFiltro,
  lancamentos,
  metodos,
  caixas,
  categorias,
  usaVariosCaixas,
}: {
  data: string;
  hoje: string;
  caixaFiltro: string | null;
  lancamentos: LancamentoRow[];
  metodos: MetodoPagamento[];
  caixas: Caixa[];
  categorias: CategoriaOpcao[];
  usaVariosCaixas: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [novo, setNovo] = useState<{ tipo: "entrada" | "saida"; chave: number } | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  const dia = DateTime.fromISO(data);
  const ehHoje = data === hoje;
  const diaLabel = (() => {
    const t = dia.setLocale("pt-BR").toFormat("cccc, dd 'de' LLLL");
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();

  function irPara(novaData: string, caixa: string | null = caixaFiltro) {
    const params = new URLSearchParams();
    if (novaData !== hoje) params.set("data", novaData);
    if (caixa) params.set("caixa", caixa);
    const qs = params.toString();
    router.push(qs ? `/caixa?${qs}` : "/caixa");
  }

  const entradas = lancamentos.filter((l) => l.tipo === "entrada");
  const saidas = lancamentos.filter((l) => l.tipo === "saida");
  const soma = (rows: LancamentoRow[], campo: "brutoCentavos" | "taxaCentavos" | "liquidoCentavos") =>
    rows.reduce((s, l) => s + l[campo], 0);

  const entradasBruto = soma(entradas, "brutoCentavos");
  const taxas = soma(entradas, "taxaCentavos");
  const entradasLiquido = soma(entradas, "liquidoCentavos");
  const saidasTotal = soma(saidas, "brutoCentavos");
  const saldo = entradasLiquido - saidasTotal;
  const saidasAPagar = saidas.filter((l) => l.status === "previsto").reduce((s, l) => s + l.brutoCentavos, 0);

  const porForma = GRUPOS_RECEBIMENTO.map((g) => ({
    ...g,
    total: entradas
      .filter((l) => l.metodoTipo && grupoDoTipo(l.metodoTipo) === g.valor)
      .reduce((s, l) => s + l.brutoCentavos, 0),
  })).filter((g) => g.total > 0);

  const cancelando = lancamentos.find((l) => l.id === cancelandoId) ?? null;

  function alternarRealizado(l: LancamentoRow) {
    startTransition(async () => {
      const result = await marcarRealizado(l.id, l.status !== "realizado");
      if ("error" in result) toast.error(result.error);
    });
  }

  function handleCancelar() {
    if (!cancelandoId) return;
    startTransition(async () => {
      const result = await cancelarLancamento(cancelandoId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(result.aviso ? `Lançamento cancelado. ${result.aviso}` : "Lançamento cancelado.");
        setCancelandoId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Caixa"
        description="O que entrou e saiu no dia, por forma de pagamento, com as taxas já descontadas."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setNovo({ tipo: "saida", chave: Date.now() })}>
              <ArrowDownCircle size={16} /> Despesa
            </Button>
            <Button onClick={() => setNovo({ tipo: "entrada", chave: Date.now() })}>
              <Plus size={16} /> Entrada
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dia anterior"
            onClick={() => irPara(dia.minus({ days: 1 }).toISODate()!)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-52 text-center text-sm font-medium">{diaLabel}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Próximo dia"
            onClick={() => irPara(dia.plus({ days: 1 }).toISODate()!)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <Input
          type="date"
          aria-label="Ir para o dia"
          value={data}
          onChange={(e) => e.target.value && irPara(e.target.value)}
          className="w-40"
        />
        {!ehHoje && (
          <Button variant="outline" size="sm" onClick={() => irPara(hoje)}>
            Hoje
          </Button>
        )}
        {usaVariosCaixas && (
          <FormSelect
            value={caixaFiltro ?? TODOS_CAIXAS}
            onValueChange={(v) => irPara(data, v === TODOS_CAIXAS ? null : v)}
            className="w-48"
            options={[
              { value: TODOS_CAIXAS, label: "Todos os caixas" },
              ...caixas.filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome })),
            ]}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          icon={ArrowUpCircle}
          label="Entradas"
          value={formatCentavos(entradasBruto)}
          hint={`${entradas.length} lançamento${entradas.length === 1 ? "" : "s"}`}
        />
        <MetricCard
          icon={Percent}
          label="Taxas"
          value={formatCentavos(taxas)}
          hint={`Líquido ${formatCentavos(entradasLiquido)}`}
        />
        <MetricCard
          icon={ArrowDownCircle}
          label="Saídas"
          value={formatCentavos(saidasTotal)}
          hint={saidasAPagar > 0 ? `${formatCentavos(saidasAPagar)} ainda a pagar` : "Tudo pago"}
        />
        <MetricCard
          icon={Scale}
          label="Saldo do dia"
          value={formatCentavos(saldo)}
          hint="Entradas líquidas menos saídas"
          tom={saldo > 0 ? "positivo" : saldo < 0 ? "negativo" : undefined}
        />
      </div>

      {porForma.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {porForma.map((g) => (
            <span
              key={g.valor}
              className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-sm"
            >
              <span className="text-muted-foreground">{g.label}</span>
              <span className="font-semibold">{formatCentavos(g.total)}</span>
            </span>
          ))}
        </div>
      )}

      {lancamentos.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum lançamento neste dia"
          description="Registre uma entrada (um recebimento) ou uma despesa para começar."
          action={
            <Button onClick={() => setNovo({ tipo: "entrada", chave: Date.now() })}>
              <Plus size={16} /> Lançar entrada
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card glass">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lançamento</TableHead>
                <TableHead className="hidden md:table-cell">Forma</TableHead>
                {usaVariosCaixas && <TableHead className="hidden lg:table-cell">Caixa</TableHead>}
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden sm:table-cell">Situação</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancamentos.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <span className="flex flex-col">
                      <span className="flex items-center gap-2 font-medium">
                        {l.tipo === "entrada" ? (
                          <ArrowUpCircle size={14} className="text-emerald-600" aria-label="Entrada" />
                        ) : (
                          <ArrowDownCircle size={14} className="text-destructive" aria-label="Despesa" />
                        )}
                        {l.descricao || l.categoria || (l.tipo === "entrada" ? "Entrada" : "Despesa")}
                        {l.parcelasTotal > 1 && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {l.parcelaNumero}/{l.parcelasTotal}
                          </span>
                        )}
                      </span>
                      {l.descricao && l.categoria && (
                        <span className="text-xs text-muted-foreground">{l.categoria}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{l.metodo ?? "—"}</TableCell>
                  {usaVariosCaixas && <TableCell className="hidden lg:table-cell">{l.caixa ?? "—"}</TableCell>}
                  <TableCell className="text-right">
                    <span className="flex flex-col items-end">
                      <span className={cn("font-medium", l.tipo === "saida" && "text-destructive")}>
                        {l.tipo === "saida" ? "−" : ""}
                        {formatCentavos(l.brutoCentavos)}
                      </span>
                      {l.taxaCentavos > 0 && (
                        <span className="text-xs text-muted-foreground">
                          taxa {formatCentavos(l.taxaCentavos)} · líquido {formatCentavos(l.liquidoCentavos)}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusLancamento l={l} hoje={hoje} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        aria-label={
                          l.status === "realizado"
                            ? "Voltar para previsto"
                            : l.tipo === "entrada"
                              ? "Marcar como recebido"
                              : "Marcar como pago"
                        }
                        title={
                          l.status === "realizado"
                            ? "Voltar para previsto"
                            : l.tipo === "entrada"
                              ? "Marcar como recebido"
                              : "Marcar como pago"
                        }
                        onClick={() => alternarRealizado(l)}
                      >
                        {l.status === "realizado" ? <RotateCcw size={16} /> : <Check size={16} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Cancelar lançamento"
                        title="Cancelar lançamento"
                        onClick={() => setCancelandoId(l.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {novo && (
        <LancamentoDialog
          key={novo.chave}
          open
          onOpenChange={(open) => !open && setNovo(null)}
          tipoInicial={novo.tipo}
          dataInicial={data}
          metodos={metodos}
          categorias={categorias}
          caixas={caixas}
          usaVariosCaixas={usaVariosCaixas}
        />
      )}

      <ConfirmDialog
        open={!!cancelandoId}
        onOpenChange={(open) => !open && setCancelandoId(null)}
        title="Cancelar este lançamento?"
        description={
          cancelando?.origem === "extrato"
            ? "Esse valor veio de um extrato pago no Financeiro. Ele sai do caixa e o extrato volta a ficar em aberto."
            : cancelando && cancelando.parcelasTotal > 1
              ? "Ele tem parcelas: todas serão canceladas juntas e saem dos totais."
              : "Ele sai dos totais do caixa. Essa ação não tem como desfazer pela tela."
        }
        confirmLabel="Cancelar lançamento"
        pendingLabel="Cancelando..."
        onConfirm={handleCancelar}
        pending={isPending}
      />
    </div>
  );
}
