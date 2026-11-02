"use client";

import { useEffect, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { MessageCircle, Plus, Search, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormSelect } from "@/components/shared/FormSelect";
import { Alternar } from "@/components/shared/Alternar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { normalizarBusca } from "@/components/shared/Combobox";
import { formatPhoneBR } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { ETAPAS, ETAPA_INFO, ORIGENS, ORIGEM_LABEL, type EntradaHistorico, type EtapaLead, type Lead, type OrigemLead } from "@/lib/leads";
import {
  adicionarNotaLead,
  alternarOptoutLead,
  atualizarLead,
  carregarHistoricoLead,
  criarLead,
  enviarMensagemLead,
  excluirLead,
  mudarEtapaLead,
  type LeadForm,
} from "./actions";

const VAZIO: LeadForm = { nome: "", telefone: "", email: "", petshopNome: "", observacoes: "", etapa: "novo" };

function relativo(iso: string | null): string {
  if (!iso) return "nunca";
  return DateTime.fromISO(iso).setLocale("pt-BR").toRelative() ?? "—";
}

function formDoLead(l: Lead): LeadForm {
  return {
    nome: l.nome,
    telefone: l.telefone ? formatPhoneBR(l.telefone) : "",
    email: l.email ?? "",
    petshopNome: l.petshopNome ?? "",
    observacoes: l.observacoes ?? "",
    etapa: l.etapa,
  };
}

export function LeadsView({ leads, whatsappPronto }: { leads: Lead[]; whatsappPronto: boolean }) {
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<OrigemLead | "todas">("todas");
  const [aberto, setAberto] = useState<Lead | "novo" | null>(null);
  const [, startTransition] = useTransition();

  const termo = normalizarBusca(busca);
  const filtrados = leads.filter(
    (l) =>
      (origem === "todas" || l.origem === origem) &&
      (!termo || normalizarBusca(`${l.nome} ${l.petshopNome ?? ""} ${l.email ?? ""} ${l.telefone ?? ""}`).includes(termo))
  );

  function mover(l: Lead, etapa: EtapaLead) {
    startTransition(async () => {
      const r = await mudarEtapaLead(l.id, etapa);
      if ("error" in r) toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        description="Quem chegou pelo teste grátis, pela landing page ou foi adicionado à mão. Acompanhe cada um até virar assinante."
        action={
          <Button onClick={() => setAberto("novo")}>
            <Plus size={16} /> Novo lead
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, petshop, e-mail ou telefone..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["todas", ...ORIGENS] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrigem(o)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                origem === o ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white hover:border-primary"
              )}
            >
              {o === "todas" ? "Todas as origens" : ORIGEM_LABEL[o]}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {ETAPAS.map((etapa) => {
          const coluna = filtrados.filter((l) => l.etapa === etapa);
          const info = ETAPA_INFO[etapa];
          return (
            <section key={etapa} className="flex w-72 shrink-0 flex-col gap-2 md:min-w-0 md:flex-1" aria-label={info.label}>
              <header className="flex items-center justify-between px-1">
                <span className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", info.classe)} title={info.dica}>
                    {info.label}
                  </span>
                </span>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{coluna.length}</span>
              </header>
              <div className="flex flex-col gap-2">
                {coluna.length === 0 && <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Nenhum lead aqui</p>}
                {coluna.map((l) => (
                  <article key={l.id} className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
                    <button type="button" onClick={() => setAberto(l)} className="flex flex-col gap-0.5 text-left">
                      <span className="font-semibold leading-tight">{l.nome}</span>
                      {l.petshopNome && <span className="text-xs text-muted-foreground">{l.petshopNome}</span>}
                      <span className="text-xs text-muted-foreground">
                        {l.telefone ? formatPhoneBR(l.telefone) : l.email}
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">{ORIGEM_LABEL[l.origem]}</span>
                      {l.optout && <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">Não receber</span>}
                      <span className="text-muted-foreground">contato {relativo(l.ultimoContatoEm)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <FormSelect
                          value={l.etapa}
                          onValueChange={(v) => mover(l, v as EtapaLead)}
                          options={ETAPAS.map((e) => ({ value: e, label: ETAPA_INFO[e].label }))}
                        />
                      </div>
                      {l.telefone && (
                        <a
                          href={`https://wa.me/${l.telefone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Abrir WhatsApp de ${l.nome}`}
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success hover:bg-success/20"
                        >
                          <MessageCircle size={16} />
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={aberto !== null} onOpenChange={(o) => !o && setAberto(null)}>
        <SheetContent className="gap-0 sm:max-w-lg">
          {aberto && (
            <LeadPainel
              key={aberto === "novo" ? "novo" : aberto.id}
              lead={aberto === "novo" ? null : aberto}
              whatsappPronto={whatsappPronto}
              onFechar={() => setAberto(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LeadPainel({ lead, whatsappPronto, onFechar }: { lead: Lead | null; whatsappPronto: boolean; onFechar: () => void }) {
  const [form, setForm] = useState<LeadForm>(lead ? formDoLead(lead) : VAZIO);
  const [historico, setHistorico] = useState<EntradaHistorico[]>([]);
  const [nota, setNota] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [optout, setOptout] = useState(lead?.optout ?? false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!lead) return;
    let vivo = true;
    carregarHistoricoLead(lead.id).then((h) => vivo && setHistorico(h));
    return () => {
      vivo = false;
    };
  }, [lead]);

  function recarregarHistorico() {
    if (lead) carregarHistoricoLead(lead.id).then(setHistorico);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = lead ? await atualizarLead(lead.id, form) : await criarLead(form);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(lead ? "Lead atualizado." : "Lead criado.");
      onFechar();
    });
  }

  function anotar() {
    if (!lead) return;
    startTransition(async () => {
      const r = await adicionarNotaLead(lead.id, nota);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setNota("");
      recarregarHistorico();
    });
  }

  function enviar() {
    if (!lead) return;
    startTransition(async () => {
      const r = await enviarMensagemLead(lead.id, mensagem);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Mensagem enviada.");
      setMensagem("");
      recarregarHistorico();
    });
  }

  function mudarOptout(v: boolean) {
    if (!lead) return;
    setOptout(v);
    startTransition(async () => {
      const r = await alternarOptoutLead(lead.id, v);
      if ("error" in r) {
        setOptout(!v);
        toast.error(r.error);
      } else recarregarHistorico();
    });
  }

  function excluir() {
    if (!lead) return;
    startTransition(async () => {
      const r = await excluirLead(lead.id);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Lead excluído.");
      setExcluindo(false);
      onFechar();
    });
  }

  const campo = (k: keyof LeadForm) => ({
    value: form[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>{lead ? lead.nome : "Novo lead"}</SheetTitle>
        <SheetDescription>{lead ? `${ORIGEM_LABEL[lead.origem]} · criado ${relativo(lead.criadoEm)}` : "Adicione um contato à mão."}</SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        <form onSubmit={salvar} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Nome
              <Input {...campo("nome")} maxLength={80} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              WhatsApp
              <Input {...campo("telefone")} type="tel" placeholder="(47) 99999-9999" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              E-mail
              <Input {...campo("email")} type="email" />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Petshop
              <Input {...campo("petshopNome")} maxLength={80} />
            </label>
            <div className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Etapa
              <FormSelect
                value={form.etapa}
                onValueChange={(v) => setForm((f) => ({ ...f, etapa: v as EtapaLead }))}
                options={ETAPAS.map((e) => ({ value: e, label: ETAPA_INFO[e].label, hint: ETAPA_INFO[e].dica }))}
              />
            </div>
            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Observações
              <Textarea {...campo("observacoes")} rows={2} maxLength={1000} />
            </label>
          </div>
          <div className="flex items-center justify-between">
            {lead ? (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setExcluindo(true)}>
                <Trash2 size={14} /> Excluir
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : lead ? "Salvar" : "Criar lead"}
            </Button>
          </div>
        </form>

        {lead && (
          <>
            <section className="flex flex-col gap-2 rounded-2xl border border-border bg-white/50 p-4">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="flex flex-col">
                  <span className="font-semibold">Não enviar mais mensagens</span>
                  <span className="text-xs text-muted-foreground">Fica de fora dos disparos e do envio direto.</span>
                </span>
                <Alternar ligado={optout} onChange={mudarOptout} rotulo="Não enviar mais mensagens" />
              </label>
            </section>

            {lead.telefone && !optout && (
              <section className="flex flex-col gap-2 rounded-2xl border border-border bg-white/50 p-4">
                <h3 className="text-sm font-bold">Enviar WhatsApp</h3>
                {whatsappPronto ? (
                  <>
                    <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} maxLength={1500} placeholder="Escreva a mensagem..." />
                    <Button size="sm" className="self-end" onClick={enviar} disabled={isPending || !mensagem.trim()}>
                      <Send size={14} /> Enviar pelo número da plataforma
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Configure e conecte o número em Admin › Plataforma para enviar daqui.</p>
                )}
              </section>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-bold">Histórico</h3>
              <div className="flex gap-2">
                <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Anotar algo (ligação, interesse...)" maxLength={1000} />
                <Button size="sm" variant="outline" onClick={anotar} disabled={isPending || !nota.trim()}>
                  Anotar
                </Button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {historico.length === 0 && <li className="text-xs text-muted-foreground">Nada registrado ainda.</li>}
                {historico.map((h) => (
                  <li key={h.id} className="flex flex-col rounded-xl bg-white/60 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      {h.tipo === "nota" ? "Anotação" : h.tipo === "etapa" ? "Etapa" : "Mensagem"} · {DateTime.fromISO(h.criadoEm).setLocale("pt-BR").toFormat("dd/LL HH:mm")}
                    </span>
                    <span className="whitespace-pre-wrap text-sm">{h.texto}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      <ConfirmDialog
        open={excluindo}
        onOpenChange={setExcluindo}
        title={`Excluir ${lead?.nome}?`}
        description="O lead e o histórico dele somem. A conta do petshop, se existir, não é afetada."
        confirmLabel="Excluir"
        pendingLabel="Excluindo..."
        onConfirm={excluir}
        pending={isPending}
      />
    </>
  );
}
