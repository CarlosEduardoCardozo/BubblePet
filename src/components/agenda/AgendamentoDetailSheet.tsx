"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Check, CheckCheck, Pencil, Plus, UserX, XCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormSelect } from "@/components/shared/FormSelect";
import { formatCentavos } from "@/lib/currency";
import {
  atualizarAdicionais,
  updateAgendamento,
  updateAgendamentoStatus,
} from "@/app/(app)/agenda/actions";
import { somaAdicionais } from "@/lib/adicionais";
import { precoParaPorte } from "@/lib/servico-preco";
import { STATUS_LABELS, type AgendamentoStatus } from "@/lib/agendamento";
import {
  calcularHorariosLivres,
  ZONE,
  type HorarioFuncionamento,
  type Ocupado,
} from "@/lib/agenda/slots";
import { LembreteButton } from "./LembreteButton";
import {
  AdicionaisEditor,
  adicionaisDasLinhas,
  linhasDeAdicionais,
  type LinhaAdicional,
} from "./AdicionaisEditor";
import type { AgendamentoEvent, PetOption, ServicoOption } from "./AgendaView";

export function AgendamentoDetailSheet({
  open,
  onOpenChange,
  agendamento,
  servicos,
  pets,
  horario,
  ocupados,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamento: AgendamentoEvent | null;
  servicos: ServicoOption[];
  pets: PetOption[];
  horario: HorarioFuncionamento;
  ocupados: Ocupado[];
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState<"cancelado" | "faltou" | null>(null);
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState({ data: "", hora: "", servicoId: "", observacoes: "" });
  const [editandoExtras, setEditandoExtras] = useState(false);
  const [linhasExtras, setLinhasExtras] = useState<LinhaAdicional[]>([]);

  // Mantém o último agendamento durante a animação de fechar, senão o título
  // pisca vazio.
  const [ultimo, setUltimo] = useState<AgendamentoEvent | null>(null);
  if (agendamento && agendamento !== ultimo) {
    setUltimo(agendamento);
    setEditando(false);
    setEditandoExtras(false);
    setErro(null);
  }
  const dados = agendamento ?? ultimo;

  function aplicarStatus(status: AgendamentoStatus) {
    if (!dados) return;
    const id = dados.id;
    startTransition(async () => {
      const result = await updateAgendamentoStatus(id, status);
      setConfirmando(null);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Marcado como ${STATUS_LABELS[status].toLowerCase()}.`);
        onChanged();
      }
    });
  }

  function iniciarEdicao() {
    if (!dados) return;
    const dt = DateTime.fromISO(dados.inicio).setZone(ZONE);
    setEdicao({
      data: dt.toISODate()!,
      hora: dt.toFormat("HH:mm"),
      servicoId: dados.servicoId,
      observacoes: dados.observacoes ?? "",
    });
    setErro(null);
    setEditando(true);
  }

  function salvarEdicao(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dados) return;
    const inicio = DateTime.fromISO(`${edicao.data}T${edicao.hora}`, { zone: ZONE });
    if (!inicio.isValid) {
      setErro("Escolha a data e o horário.");
      return;
    }
    const id = dados.id;
    startTransition(async () => {
      const result = await updateAgendamento(id, {
        inicio: inicio.toISO()!,
        servicoId: edicao.servicoId,
        observacoes: edicao.observacoes,
      });
      if ("error" in result) {
        setErro(result.error);
      } else {
        toast.success("Agendamento atualizado.");
        setEditando(false);
        onChanged();
      }
    });
  }

  function iniciarExtras() {
    if (!dados) return;
    const linhas = linhasDeAdicionais(dados.adicionais);
    setLinhasExtras(linhas.length ? linhas : []);
    setErro(null);
    setEditandoExtras(true);
  }

  function salvarExtras() {
    if (!dados) return;
    const extras = adicionaisDasLinhas(linhasExtras);
    if (!extras.ok) {
      setErro(extras.erro);
      return;
    }
    const id = dados.id;
    startTransition(async () => {
      const result = await atualizarAdicionais(id, extras.adicionais);
      if ("error" in result) {
        setErro(result.error);
      } else {
        toast.success(extras.adicionais.length ? "Adicionais salvos." : "Adicionais removidos.");
        setEditandoExtras(false);
        onChanged();
      }
    });
  }

  const inicio = dados ? DateTime.fromISO(dados.inicio).setZone(ZONE).setLocale("pt-BR") : null;
  const fim = dados ? DateTime.fromISO(dados.fim).setZone(ZONE) : null;
  const encerrado = dados?.status === "concluido" || dados?.status === "cancelado" || dados?.status === "faltou";
  const porte = dados ? (pets.find((p) => p.id === dados.petId)?.porte ?? null) : null;
  const totalExtras = somaAdicionais(dados?.adicionais);
  // Extras podem entrar até depois do banho, enquanto não foram cobrados.
  const podeEditarExtras =
    !!dados && !dados.cobrado && dados.status !== "cancelado" && dados.status !== "faltou";

  // Horários livres pro dia da edição, ignorando o próprio agendamento.
  const servicoEdicao = servicos.find((s) => s.id === edicao.servicoId) ?? null;
  const duracaoEdicao = servicoEdicao?.duracao_min ?? 30;
  const ocupadosSemEste = dados
    ? ocupados.filter((o) => o.id !== dados.id)
    : ocupados;
  const horariosEdicao = (() => {
    if (!editando || !edicao.data) return [] as string[];
    const livres = calcularHorariosLivres({
      dataISO: edicao.data,
      duracaoMin: duracaoEdicao,
      ocupados: ocupadosSemEste,
      horario,
      stepMin: 15,
      antecedenciaMin: 0,
    }).map((dt) => dt.toFormat("HH:mm"));
    const set = new Set(livres);
    if (edicao.hora) set.add(edicao.hora);
    return Array.from(set).sort();
  })();

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{dados?.petNome ?? "Agendamento"}</SheetTitle>
            <SheetDescription>
              {dados?.tutorNome}
              {dados?.tutorNome && dados?.servicoNome ? " · " : ""}
              {dados?.servicoNome}
            </SheetDescription>
          </SheetHeader>

          {dados && inicio && fim && !editando && (
            <div className="flex flex-1 flex-col gap-4 px-4">
              <div className="flex items-center justify-between">
                <StatusBadge status={dados.status} />
                {!encerrado && <LembreteButton agendamentoId={dados.id} size="sm" variant="outline" />}
              </div>

              <div className="flex items-center justify-between rounded-[12px] border border-border px-3 py-2.5">
                <div className="flex flex-col text-sm">
                  <span className="font-medium">
                    {(() => {
                      const d = inicio.toFormat("cccc, dd/LL");
                      return d.charAt(0).toUpperCase() + d.slice(1);
                    })()}
                  </span>
                  <span className="text-muted-foreground">
                    {inicio.toFormat("HH:mm")} – {fim.toFormat("HH:mm")} · {dados.servicoNome}
                  </span>
                </div>
                {!encerrado && (
                  <Button variant="ghost" size="sm" onClick={iniciarEdicao}>
                    <Pencil size={14} /> Editar
                  </Button>
                )}
              </div>

              <div
                className={
                  dados.origemPlano
                    ? "rounded-[12px] bg-primary/5 px-3 py-2 text-sm"
                    : "rounded-[12px] bg-muted px-3 py-2 text-sm"
                }
              >
                {dados.origemPlano ? (
                  <>
                    <span className="font-medium text-primary">Coberto pelo plano</span>
                    <span className="text-muted-foreground">
                      {" — 1 crédito do mês."}
                      {totalExtras > 0 ? " Só os adicionais são cobrados." : " Sem cobrança."}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Avulso</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {dados.valorCentavos != null
                        ? `${formatCentavos(dados.valorCentavos)}, entra no fechamento do mês.`
                        : "valor do serviço na data."}
                    </span>
                  </>
                )}
              </div>

              {editandoExtras ? (
                <div className="flex flex-col gap-2 rounded-[12px] border border-border p-3">
                  <span className="text-sm font-medium">Adicionais</span>
                  <AdicionaisEditor
                    linhas={linhasExtras}
                    onChange={setLinhasExtras}
                    sugestoesExtras={servicos.filter((s) => s.id !== dados.servicoId).map((s) => s.nome)}
                    disabled={isPending}
                  />
                  {erro && (
                    <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {erro}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditandoExtras(false)} disabled={isPending}>
                      Voltar
                    </Button>
                    <Button size="sm" onClick={salvarExtras} disabled={isPending}>
                      {isPending ? "Salvando..." : "Salvar adicionais"}
                    </Button>
                  </div>
                </div>
              ) : dados.adicionais.length > 0 ? (
                <div className="flex flex-col gap-1 rounded-[12px] border border-border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Adicionais</span>
                    {podeEditarExtras && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={iniciarExtras}>
                        <Pencil size={12} /> Editar
                      </Button>
                    )}
                  </div>
                  {dados.adicionais.map((a, i) => (
                    <div key={i} className="flex justify-between">
                      <span>+ {a.descricao}</span>
                      <span>{formatCentavos(a.valorCentavos)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border pt-1 font-semibold">
                    <span>Total do atendimento</span>
                    <span>{formatCentavos((dados.origemPlano ? 0 : (dados.valorCentavos ?? 0)) + totalExtras)}</span>
                  </div>
                  {dados.cobrado && (
                    <span className="text-xs text-muted-foreground">Já cobrado num extrato enviado.</span>
                  )}
                </div>
              ) : (
                podeEditarExtras && (
                  <button
                    type="button"
                    onClick={iniciarExtras}
                    className="flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline"
                  >
                    <Plus size={14} /> Cobrar um adicional (desembolo, hidratação...)
                  </button>
                )
              )}

              {dados.observacoes && (
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="text-xs text-muted-foreground">Observações</span>
                  <span className="whitespace-pre-wrap">{dados.observacoes}</span>
                </div>
              )}

              <SheetFooter className="mt-auto flex-col gap-2 px-0">
                {dados.status === "agendado" && (
                  <Button variant="outline" disabled={isPending} onClick={() => aplicarStatus("confirmado")}>
                    <Check size={16} /> Confirmar presença
                  </Button>
                )}
                {(dados.status === "agendado" || dados.status === "confirmado") && (
                  <Button disabled={isPending} onClick={() => aplicarStatus("concluido")}>
                    <CheckCheck size={16} /> Concluir atendimento
                  </Button>
                )}
                {!encerrado && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-muted-foreground"
                      disabled={isPending}
                      onClick={() => setConfirmando("faltou")}
                    >
                      <UserX size={14} /> Não veio
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => setConfirmando("cancelado")}
                    >
                      <XCircle size={14} /> Cancelar
                    </Button>
                  </div>
                )}
                {encerrado && dados.status !== "concluido" && (
                  <Button variant="outline" disabled={isPending} onClick={() => aplicarStatus("agendado")}>
                    Reabrir agendamento
                  </Button>
                )}
              </SheetFooter>
            </div>
          )}

          {dados && editando && (
            <form onSubmit={salvarEdicao} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-data">Data</Label>
                  <Input
                    id="edit-data"
                    type="date"
                    value={edicao.data}
                    onChange={(e) => setEdicao((v) => ({ ...v, data: e.target.value, hora: "" }))}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-hora">Horário</Label>
                  <FormSelect
                    id="edit-hora"
                    value={edicao.hora}
                    onValueChange={(hora) => setEdicao((v) => ({ ...v, hora }))}
                    placeholder="Escolha"
                    options={horariosEdicao.map((h) => ({ value: h, label: h }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-servico">Serviço</Label>
                <FormSelect
                  id="edit-servico"
                  value={edicao.servicoId}
                  onValueChange={(servicoId) => setEdicao((v) => ({ ...v, servicoId, hora: "" }))}
                  disabled={dados.origemPlano}
                  options={servicos.map((s) => ({
                    value: s.id,
                    label: s.nome,
                    hint: `${s.duracao_min} min · ${formatCentavos(precoParaPorte(s, porte))}`,
                  }))}
                />
                {dados.origemPlano && (
                  <p className="text-xs text-muted-foreground">
                    Atendimento pago com crédito do plano: dá pra mudar o horário, não o serviço.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-obs">Observações</Label>
                <Textarea
                  id="edit-obs"
                  rows={3}
                  value={edicao.observacoes}
                  onChange={(e) => setEdicao((v) => ({ ...v, observacoes: e.target.value }))}
                />
              </div>

              {erro && (
                <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erro}
                </p>
              )}

              <SheetFooter className="mt-auto flex-row justify-end px-0">
                <Button type="button" variant="outline" onClick={() => setEditando(false)} disabled={isPending}>
                  Voltar
                </Button>
                <Button type="submit" disabled={isPending || !edicao.hora || !edicao.servicoId}>
                  {isPending ? "Salvando..." : "Salvar alterações"}
                </Button>
              </SheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmando === "cancelado"}
        onOpenChange={(o) => !o && setConfirmando(null)}
        title="Cancelar este agendamento?"
        description={
          dados?.origemPlano
            ? "O crédito do plano volta para o pet automaticamente. O horário fica livre na agenda."
            : "O horário fica livre na agenda. Dá pra reabrir depois, se precisar."
        }
        confirmLabel="Cancelar agendamento"
        pendingLabel="Cancelando..."
        onConfirm={() => aplicarStatus("cancelado")}
        pending={isPending}
      />
      <ConfirmDialog
        open={confirmando === "faltou"}
        onOpenChange={(o) => !o && setConfirmando(null)}
        title="Marcar como falta?"
        description={
          dados?.origemPlano
            ? "O crédito do plano é consumido mesmo assim — o tutor não compareceu."
            : "O atendimento não entra no fechamento do mês."
        }
        confirmLabel="Marcar falta"
        pendingLabel="Salvando..."
        confirmVariant="default"
        onConfirm={() => aplicarStatus("faltou")}
        pending={isPending}
      />
    </>
  );
}
