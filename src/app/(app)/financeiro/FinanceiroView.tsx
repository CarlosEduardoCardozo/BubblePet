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
  periodoInicio: string | null;
  periodoFim: string | null;
};

type Resumo = {
  aFecharCentavos: number;
  clientesAFechar: number;
  aguardandoCentavos: number;
  extratosAguardando: number;
  recebidoCentavos: number;
  atendimentosNoMes: number;
  atendimentosCobertos: number;
  pendentes: number;
};

function periodoLabel(inicio: string | null, fim: string | null): string {
  if (!inicio || !fim) return "—";
  const i = DateTime.fromISO(inicio).toFormat("dd/LL");
  const f = DateTime.fromISO(fim).toFormat("dd/LL");
  return i === f ? i : `${i} a ${f}`;
}

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
      if (r.gerados) partes.push(`${r.gerados} extrato${r.gerados === 1 ? "" : "s"} novo${r.gerados === 1 ? "" : "s"}`);
      if (r.atualizados) partes.push(`${r.atualizados} atualizado${r.atualizados === 1 ? "" : "s"}`);
      if (r.removidos) partes.push(`${r.removidos} removido${r.removidos === 1 ? "" : "s"} (nada mais a cobrar)`);
      toast.success(partes.length ? `Fechamento pronto: ${partes.join(", ")}. Revise e envie.` : "Nada a cobrar agora.");
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
    const ids = rascunhos.map((f) => f.id);
    if (ids.length === 0) {
      toast.info("Nenhum extrato novo para enviar.");
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

  // Rascunho = gerado e ainda não enviado. "Enviar" em lote só manda estes;
  // reenviar um já enviado é pelo botão da linha.
  const rascunhos = fechamentos.filter((f) => f.status === "aberto" && !f.enviadoEm);
  const ocupado = isPending || !!enviando;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financeiro"
        description="Junta os banhos que já passaram e ainda não foram cobrados, manda o extrato pelo WhatsApp e controla quem pagou."
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
          icon={Receipt}
          label="A fechar"
          value={formatCentavos(resumo.aFecharCentavos)}
          hint={`${resumo.clientesAFechar} cliente${resumo.clientesAFechar === 1 ? "" : "s"} com algo a cobrar`}
        />
        <MetricCard
          icon={Send}
          label="Aguardando pagamento"
          value={formatCentavos(resumo.aguardandoCentavos)}
          hint={`${resumo.extratosAguardando} extrato${resumo.extratosAguardando === 1 ? "" : "s"} enviado${resumo.extratosAguardando === 1 ? "" : "s"}`}
        />
        <MetricCard
          icon={Wallet}
          label="Recebido"
          value={formatCentavos(resumo.recebidoCentavos)}
          hint={`extratos de ${mesLabel.toLowerCase()} pagos`}
          destaque
        />
        <MetricCard
          icon={Landmark}
          label="Atendimentos no mês"
          value={String(resumo.atendimentosNoMes)}
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
                {resumo.pendentes} cliente{resumo.pendentes === 1 ? "" : "s"} com banhos ainda não cobrados
              </span>
              <span className="text-muted-foreground">
                {" "}
                — entram todos os atendimentos que já passaram (menos cancelados e faltas) e as mensalidades de planos.
              </span>
            </span>
          </div>
          <Button onClick={gerar} disabled={ocupado}>
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
            {rascunhos.length ? "Atualizar fechamento" : "Gerar fechamento"}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {resumo.pendentes === 0 && rascunhos.length > 0 && (
          <Button variant="outline" onClick={gerar} disabled={ocupado}>
            <RefreshCw size={16} /> Recalcular
          </Button>
        )}
        <Button
          onClick={() => setConfirmEnvio(true)}
          disabled={ocupado || rascunhos.length === 0 || !petshop.whatsappConectado}
          title={!petshop.whatsappConectado ? "Conecte o WhatsApp em Configurações" : undefined}
        >
          {enviando ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Enviando {enviando.feitos}/{enviando.total}
            </>
          ) : (
            <>
              <Send size={16} /> Enviar {rascunhos.length > 0 ? `${rascunhos.length} extrato${rascunhos.length === 1 ? "" : "s"} novo${rascunhos.length === 1 ? "" : "s"}` : "extratos"} pelo WhatsApp
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
        resumo.clientesAFechar > 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhum extrato gerado neste mês"
            description={`${resumo.clientesAFechar} cliente${resumo.clientesAFechar === 1 ? " tem" : "s têm"} banhos que já passaram e ainda não foram cobrados. Gere o fechamento pra conferir os valores e enviar.`}
            action={
              <Button onClick={gerar} disabled={ocupado}>
                <Receipt size={16} /> Gerar fechamento
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Landmark}
            title="Nada a cobrar agora"
            description="Quando um banho marcado na agenda passar, ele aparece aqui pra entrar no próximo fechamento do cliente."
          />
        )
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden sm:table-cell">Período</TableHead>
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
                  <TableCell className="hidden text-sm sm:table-cell">
                    {periodoLabel(f.periodoInicio, f.periodoFim)}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {[
                      f.mensalidades > 0 && `${f.mensalidades} mensalidade${f.mensalidades === 1 ? "" : "s"}`,
                      f.servicos > 0 && `${f.servicos} banho${f.servicos === 1 ? "" : "s"}`,
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
                      ) : f.enviadoEm ? (
                        <Badge variant="secondary" className="bg-warning/15 text-warning-foreground">
                          Aguardando pagamento
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Não enviado</Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {f.status === "pago" && f.pagoEm
                          ? `pago ${DateTime.fromISO(f.pagoEm).setZone(ZONE).toFormat("dd/LL")}`
                          : f.enviadoEm
                            ? `enviado ${DateTime.fromISO(f.enviadoEm).setZone(ZONE).toFormat("dd/LL HH:mm")}`
                            : "confira e envie"}
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
                        title={
                          !petshop.whatsappConectado
                            ? "Conecte o WhatsApp em Configurações"
                            : f.enviadoEm
                              ? "Reenviar pelo WhatsApp"
                              : "Enviar pelo WhatsApp"
                        }
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
        title={`Enviar ${rascunhos.length} extrato${rascunhos.length === 1 ? "" : "s"} pelo WhatsApp?`}
        description={`Cada cliente recebe uma mensagem com as datas dos banhos, o total${petshop.temPix ? " e a chave Pix" : ""}, e o PDF logo abaixo. Depois de enviado, o extrato não muda mais — banhos novos vão pro próximo.`}
        confirmLabel="Enviar agora"
        pendingLabel="Enviando..."
        confirmVariant="default"
        onConfirm={enviarTodos}
        pending={ocupado}
      />
    </div>
  );
}
