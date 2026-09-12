"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Landmark,
  Loader2,
  MessageCircle,
  Receipt,
  RefreshCw,
  RotateCcw,
  Send,
  Wallet,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatCentavos } from "@/lib/currency";
import { formatPhoneBR } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  enviarFechamentos,
  enviarRelatorioDono,
  gerarFechamentos,
  marcarPago,
  type ResultadoEnvioLote,
} from "./actions";

const ZONE = "America/Sao_Paulo";
const LOTE = 25;

export type FechamentoRow = {
  id: string;
  tutorId: string;
  tutorNome: string;
  tutorTelefone: string;
  totalCentavos: number;
  status: "aberto" | "pago";
  servicos: number;
  mensalidades: number;
  enviadoEm: string | null;
  pagoEm: string | null;
};

type Resumo = {
  previstoCentavos: number;
  recebidoCentavos: number;
  emAbertoCentavos: number;
  atendimentos: number;
  atendimentosCobertos: number;
  mensalidadesCentavos: number;
  clientesComMovimento: number;
  pendentes: number;
};

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  destaque,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  destaque?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon size={16} className="text-primary" />
      </CardHeader>
      <CardContent>
        <div className={cn("text-xl font-semibold tracking-tight", destaque && "text-primary")}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function FinanceiroView({
  competencia,
  fechamentos,
  resumo,
  petshop,
}: {
  competencia: string;
  fechamentos: FechamentoRow[];
  resumo: Resumo;
  petshop: { temPix: boolean; temTelefone: boolean; whatsappConectado: boolean };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enviando, setEnviando] = useState<{ feitos: number; total: number } | null>(null);
  const [confirmEnvio, setConfirmEnvio] = useState(false);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  const mes = DateTime.fromISO(competencia, { zone: ZONE });
  const mesLabel = (() => {
    const t = mes.setLocale("pt-BR").toFormat("LLLL 'de' yyyy");
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();
  const mesAtual = DateTime.now().setZone(ZONE).startOf("month");
  const ehMesAtual = mes.hasSame(mesAtual, "month");

  function irParaMes(delta: number) {
    const alvo = mes.plus({ months: delta });
    router.push(`/financeiro?mes=${alvo.toFormat("yyyy-LL")}`);
  }

  function gerar() {
    startTransition(async () => {
      const r = await gerarFechamentos(competencia);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      const partes = [];
      if (r.gerados) partes.push(`${r.gerados} novo${r.gerados === 1 ? "" : "s"}`);
      if (r.atualizados) partes.push(`${r.atualizados} atualizado${r.atualizados === 1 ? "" : "s"}`);
      if (r.pagosMantidos) partes.push(`${r.pagosMantidos} pago${r.pagosMantidos === 1 ? "" : "s"} mantido${r.pagosMantidos === 1 ? "" : "s"}`);
      toast.success(partes.length ? `Fechamento gerado: ${partes.join(", ")}.` : "Nada a fechar neste mês.");
      router.refresh();
    });
  }

  function resumirEnvio(r: ResultadoEnvioLote) {
    if (r.falhas.length === 0) {
      toast.success(`${r.enviados} extrato${r.enviados === 1 ? "" : "s"} enviado${r.enviados === 1 ? "" : "s"} pelo WhatsApp.`);
    } else {
      toast.error(
        `${r.enviados} enviado${r.enviados === 1 ? "" : "s"}, ${r.falhas.length} com falha: ${r.falhas
          .slice(0, 3)
          .map((f) => f.tutorNome)
          .join(", ")}${r.falhas.length > 3 ? "..." : ""}. ${r.falhas[0]?.erro ?? ""}`,
        { duration: 8000 }
      );
    }
  }

  async function enviarLote(ids: string[]) {
    setEnviando({ feitos: 0, total: ids.length });
    const acumulado: ResultadoEnvioLote = { enviados: 0, falhas: [] };
    for (let i = 0; i < ids.length; i += LOTE) {
      const r = await enviarFechamentos(ids.slice(i, i + LOTE));
      acumulado.enviados += r.enviados;
      acumulado.falhas.push(...r.falhas);
      setEnviando({ feitos: Math.min(ids.length, i + LOTE), total: ids.length });
    }
    setEnviando(null);
    resumirEnvio(acumulado);
    router.refresh();
  }

  function enviarTodos() {
    setConfirmEnvio(false);
    const ids = fechamentos.filter((f) => f.status === "aberto").map((f) => f.id);
    if (ids.length === 0) {
      toast.info("Nenhum extrato em aberto para enviar.");
      return;
    }
    void enviarLote(ids);
  }

  function enviarUm(id: string) {
    setEnviandoId(id);
    startTransition(async () => {
      const r = await enviarFechamentos([id]);
      setEnviandoId(null);
      resumirEnvio(r);
      router.refresh();
    });
  }

  function alternarPago(f: FechamentoRow) {
    startTransition(async () => {
      const r = await marcarPago(f.id, f.status !== "pago");
      if ("error" in r) toast.error(r.error);
      else toast.success(f.status === "pago" ? "Extrato reaberto." : `${f.tutorNome} marcado como pago.`);
      router.refresh();
    });
  }

  function enviarRelatorio() {
    startTransition(async () => {
      const r = await enviarRelatorioDono(competencia);
      if ("error" in r) toast.error(r.error);
      else toast.success("Relatório enviado pro WhatsApp do petshop.");
    });
  }

  const abertos = fechamentos.filter((f) => f.status === "aberto");
  const ocupado = isPending || !!enviando;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financeiro"
        description="Fechamento do mês: extrato por cliente, envio pelo WhatsApp e controle de pagamento."
        action={
          <div className="flex items-center gap-1 rounded-[8px] border border-border bg-white p-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => irParaMes(-1)} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </Button>
            <span className="min-w-40 text-center text-sm font-medium">{mesLabel}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => irParaMes(1)}
              aria-label="Próximo mês"
              disabled={ehMesAtual}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          icon={Landmark}
          label="Previsto no mês"
          value={formatCentavos(resumo.previstoCentavos)}
          hint={`${formatCentavos(resumo.mensalidadesCentavos)} em mensalidades`}
        />
        <MetricCard
          icon={Wallet}
          label="Recebido"
          value={formatCentavos(resumo.recebidoCentavos)}
          hint={`${fechamentos.filter((f) => f.status === "pago").length} extrato${fechamentos.filter((f) => f.status === "pago").length === 1 ? "" : "s"} pago${fechamentos.filter((f) => f.status === "pago").length === 1 ? "" : "s"}`}
          destaque
        />
        <MetricCard
          icon={Receipt}
          label="Em aberto"
          value={formatCentavos(resumo.emAbertoCentavos)}
          hint={`${abertos.length} extrato${abertos.length === 1 ? "" : "s"}`}
        />
        <MetricCard
          icon={Check}
          label="Atendimentos concluídos"
          value={String(resumo.atendimentos)}
          hint={`${resumo.atendimentosCobertos} coberto${resumo.atendimentosCobertos === 1 ? "" : "s"} por plano`}
        />
      </div>

      {!petshop.temPix && (
        <p className="flex items-center gap-2 rounded-[12px] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            Sem chave PIX cadastrada — o extrato sai sem instrução de pagamento.{" "}
            <Link href="/configuracoes" className="font-medium underline">
              Cadastrar em Configurações
            </Link>
          </span>
        </p>
      )}

      {resumo.pendentes > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-start gap-2 text-sm">
            <RefreshCw size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>
              <span className="font-medium">
                {resumo.pendentes} cliente{resumo.pendentes === 1 ? "" : "s"} com movimento ainda não fechado
              </span>
              <span className="text-muted-foreground">
                {" "}
                — atendimentos concluídos e mensalidades de {mesLabel.toLowerCase()} que não estão nos extratos.
              </span>
            </span>
          </div>
          <Button onClick={gerar} disabled={ocupado}>
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
            {fechamentos.length ? "Atualizar fechamento" : "Gerar fechamento"}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {resumo.pendentes === 0 && resumo.clientesComMovimento > 0 && (
          <Button variant="outline" onClick={gerar} disabled={ocupado}>
            <RefreshCw size={16} /> Recalcular
          </Button>
        )}
        <Button
          onClick={() => setConfirmEnvio(true)}
          disabled={ocupado || abertos.length === 0 || !petshop.whatsappConectado}
          title={!petshop.whatsappConectado ? "Conecte o WhatsApp em Configurações" : undefined}
        >
          {enviando ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Enviando {enviando.feitos}/{enviando.total}
            </>
          ) : (
            <>
              <Send size={16} /> Enviar {abertos.length > 0 ? `${abertos.length} extrato${abertos.length === 1 ? "" : "s"}` : "extratos"} pelo WhatsApp
            </>
          )}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`/api/relatorios/${competencia}/pdf`} target="_blank" rel="noreferrer" />}
          >
            <FileText size={16} /> Relatório do mês
          </Button>
          <Button
            variant="outline"
            onClick={enviarRelatorio}
            disabled={ocupado || !petshop.whatsappConectado || !petshop.temTelefone}
            title={
              !petshop.whatsappConectado
                ? "Conecte o WhatsApp em Configurações"
                : !petshop.temTelefone
                  ? "Cadastre o WhatsApp do petshop em Configurações"
                  : undefined
            }
          >
            <MessageCircle size={16} /> Enviar relatório pra mim
          </Button>
        </div>
      </div>

      {fechamentos.length === 0 ? (
        resumo.clientesComMovimento > 0 ? (
          <EmptyState
            icon={Receipt}
            title={`Nenhum extrato gerado para ${mesLabel.toLowerCase()}`}
            description={`${resumo.clientesComMovimento} cliente${resumo.clientesComMovimento === 1 ? " tem" : "s têm"} atendimentos concluídos ou mensalidade neste mês. Gere o fechamento para criar os extratos, revisar e enviar.`}
            action={
              <Button onClick={gerar} disabled={ocupado}>
                <Receipt size={16} /> Gerar fechamento
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Landmark}
            title={`Sem movimento em ${mesLabel.toLowerCase()}`}
            description="Atendimentos marcados como concluídos na agenda e mensalidades de planos ativos aparecem aqui. Nada entrou ainda neste mês."
          />
        )
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Itens</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fechamentos.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{f.tutorNome}</span>
                      <span className="text-xs text-muted-foreground">{formatPhoneBR(f.tutorTelefone)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {[
                      f.mensalidades > 0 && `${f.mensalidades} mensalidade${f.mensalidades === 1 ? "" : "s"}`,
                      f.servicos > 0 && `${f.servicos} atendimento${f.servicos === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="font-medium">{formatCentavos(f.totalCentavos)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-0.5">
                      {f.status === "pago" ? (
                        <Badge variant="secondary" className="bg-success/10 text-success">
                          <Check size={12} /> Pago
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-warning/15 text-warning-foreground">
                          Em aberto
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {f.enviadoEm
                          ? `enviado ${DateTime.fromISO(f.enviadoEm).setZone(ZONE).toFormat("dd/LL HH:mm")}`
                          : "não enviado"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Ver extrato (PDF)"
                        aria-label={`Ver extrato de ${f.tutorNome}`}
                        nativeButton={false}
                        render={<a href={`/api/fechamentos/${f.id}/pdf`} target="_blank" rel="noreferrer" />}
                      >
                        <FileText size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={petshop.whatsappConectado ? "Enviar pelo WhatsApp" : "Conecte o WhatsApp em Configurações"}
                        aria-label={`Enviar extrato de ${f.tutorNome}`}
                        disabled={ocupado || !petshop.whatsappConectado}
                        onClick={() => enviarUm(f.id)}
                      >
                        {enviandoId === f.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </Button>
                      <Button
                        variant={f.status === "pago" ? "ghost" : "outline"}
                        size="sm"
                        disabled={ocupado}
                        onClick={() => alternarPago(f)}
                      >
                        {f.status === "pago" ? (
                          <>
                            <RotateCcw size={14} /> Reabrir
                          </>
                        ) : (
                          <>
                            <Check size={14} /> Marcar pago
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={confirmEnvio}
        onOpenChange={setConfirmEnvio}
        title={`Enviar ${abertos.length} extrato${abertos.length === 1 ? "" : "s"} pelo WhatsApp?`}
        description={`Cada cliente com extrato em aberto recebe o PDF de ${mesLabel.toLowerCase()} com o total${petshop.temPix ? " e a chave PIX" : ""}. Quem já recebeu recebe de novo.`}
        confirmLabel="Enviar agora"
        pendingLabel="Enviando..."
        confirmVariant="default"
        onConfirm={enviarTodos}
        pending={ocupado}
      />
    </div>
  );
}
