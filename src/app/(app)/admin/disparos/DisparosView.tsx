"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { AlertTriangle, Pause, Play, Plus, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ETAPAS, ETAPA_INFO, ORIGENS, ORIGEM_LABEL, type EtapaLead, type OrigemLead } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { cancelarDisparo, contarPublico, criarDisparo, pausarDisparo } from "./actions";

export type DisparoLinha = {
  id: string;
  nome: string;
  texto: string;
  status: "enviando" | "pausado" | "concluido" | "cancelado";
  total: number;
  enviados: number;
  erros: number;
  criadoEm: string;
};

const STATUS: Record<DisparoLinha["status"], { label: string; classe: string }> = {
  enviando: { label: "Enviando", classe: "bg-primary/10 text-primary" },
  pausado: { label: "Pausado", classe: "bg-amber-100 text-amber-800" },
  concluido: { label: "Concluído", classe: "bg-emerald-100 text-emerald-800" },
  cancelado: { label: "Cancelado", classe: "bg-zinc-200 text-zinc-700" },
};

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function DisparosView({ disparos, porHora, pronto, configurado }: { disparos: DisparoLinha[]; porHora: number; pronto: boolean; configurado: boolean }) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [cancelando, setCancelando] = useState<DisparoLinha | null>(null);
  const [isPending, startTransition] = useTransition();

  // Enquanto algo está sendo enviado, a lista se atualiza sozinha.
  const emAndamento = disparos.some((d) => d.status === "enviando");
  useEffect(() => {
    if (!emAndamento) return;
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [emAndamento, router]);

  function pausar(d: DisparoLinha) {
    startTransition(async () => {
      const r = await pausarDisparo(d.id, d.status === "enviando");
      if ("error" in r) toast.error(r.error);
    });
  }

  function confirmarCancelar() {
    if (!cancelando) return;
    const d = cancelando;
    startTransition(async () => {
      const r = await cancelarDisparo(d.id);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Disparo cancelado.");
        setCancelando(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Disparos"
        description="Mande uma mensagem para vários leads de uma vez. O envio sai aos poucos, das 8h às 20h, para proteger o número."
        action={
          <Button onClick={() => setNovo(true)} disabled={!configurado}>
            <Plus size={16} /> Novo disparo
          </Button>
        }
      />

      {!pronto && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#e8c45f] bg-sun/25 px-4 py-3 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#8a5a00]" />
          <p className="text-[#5c3d00]">
            {configurado ? "O WhatsApp da plataforma não está conectado. Os disparos ficam parados até conectar." : "Configure o servidor e o token da instância para poder disparar."}{" "}
            <Link href="/admin/plataforma" className="font-semibold underline">
              Abrir Plataforma
            </Link>
          </p>
        </div>
      )}

      {disparos.length === 0 ? (
        <p className="glass rounded-card py-10 text-center text-sm text-muted-foreground">Nenhum disparo ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {disparos.map((d) => {
            const feito = d.enviados + d.erros;
            const pct = d.total > 0 ? Math.round((feito / d.total) * 100) : 0;
            const aberto = d.status === "enviando" || d.status === "pausado";
            return (
              <article key={d.id} className="glass flex flex-col gap-3 rounded-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{d.nome}</h2>
                    <p className="text-xs text-muted-foreground">criado {DateTime.fromISO(d.criadoEm).setLocale("pt-BR").toRelative()}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS[d.status].classe)}>{STATUS[d.status].label}</span>
                </div>
                <p className="line-clamp-2 whitespace-pre-line rounded-xl bg-[#e7f7ec]/70 px-3 py-2 text-xs text-foreground/80">{d.texto}</p>
                <div className="flex flex-col gap-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {d.enviados} enviadas · {d.erros} com erro · {Math.max(0, d.total - feito)} na fila · {d.total} no total
                  </p>
                </div>
                {aberto && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => pausar(d)} disabled={isPending}>
                      {d.status === "enviando" ? <Pause size={14} /> : <Play size={14} />} {d.status === "enviando" ? "Pausar" : "Retomar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelando(d)} disabled={isPending}>
                      <XCircle size={14} /> Cancelar
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Sheet open={novo} onOpenChange={setNovo}>
        <SheetContent className="gap-0 sm:max-w-lg">
          {novo && <NovoDisparoPainel porHora={porHora} onCriado={() => setNovo(false)} />}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!cancelando}
        onOpenChange={(o) => !o && setCancelando(null)}
        title={`Cancelar "${cancelando?.nome}"?`}
        description="Quem ainda está na fila não recebe a mensagem. O que já foi enviado continua enviado."
        confirmLabel="Cancelar disparo"
        pendingLabel="Cancelando..."
        onConfirm={confirmarCancelar}
        pending={isPending}
      />
    </div>
  );
}

function NovoDisparoPainel({ porHora, onCriado }: { porHora: number; onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("Oi, {nome}! 🐾\n\nSou do BubblePet. Vi que o {petshop} ainda não organizou a agenda por aqui. Posso te mostrar em 5 minutos como funciona?");
  const [etapas, setEtapas] = useState<EtapaLead[]>(["novo", "contatado"]);
  const [origens, setOrigens] = useState<OrigemLead[]>([...ORIGENS]);
  const [total, setTotal] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Quantos leads recebem com esses filtros, atualizado ao mexer neles.
  useEffect(() => {
    let vivo = true;
    const id = setTimeout(() => {
      contarPublico({ etapas, origens }).then((r) => vivo && setTotal("total" in r ? r.total : null));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [etapas, origens]);

  const alternar = <T,>(lista: T[], item: T, set: (l: T[]) => void) => set(lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item]);
  const previa = texto.replace(/\{nome\}/g, "Carlos").replace(/\{petshop\}/g, "Pet Show");
  const horas = total ? Math.ceil(total / porHora) : 0;

  function enviar() {
    startTransition(async () => {
      const r = await criarDisparo({ nome, texto, filtro: { etapas, origens } });
      if ("error" in r) {
        toast.error(r.error);
        setConfirmar(false);
        return;
      }
      toast.success("Disparo criado. Os envios começam em até 5 minutos.");
      onCriado();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Novo disparo</SheetTitle>
        <SheetDescription>Escolha quem recebe e escreva a mensagem.</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nome do disparo
          <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Convite do teste grátis" />
        </label>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">Quem recebe</h3>
          <div className="flex flex-wrap gap-1.5">
            {ETAPAS.map((e) => (
              <Chip key={e} ativo={etapas.includes(e)} onClick={() => alternar(etapas, e, setEtapas)}>
                {ETAPA_INFO[e].label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ORIGENS.map((o) => (
              <Chip key={o} ativo={origens.includes(o)} onClick={() => alternar(origens, o, setOrigens)}>
                {ORIGEM_LABEL[o]}
              </Chip>
            ))}
          </div>
          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            {total === null ? "Contando..." : total === 0 ? "Nenhum lead recebe com esses filtros." : (
              <>
                <strong className="text-foreground">{total} {total === 1 ? "lead recebe" : "leads recebem"}</strong>, sem contar quem pediu para sair nem quem não tem WhatsApp.
                {" "}No ritmo de {porHora} por hora, leva cerca de {horas <= 1 ? "1 hora" : `${horas} horas`} (só das 8h às 20h).
              </>
            )}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">Mensagem</h3>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} maxLength={1500} />
          <div className="flex gap-1.5">
            {["{nome}", "{petshop}"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTexto((t) => `${t}${v}`)}
                className="rounded-full border border-border bg-white px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
              >
                {v}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground">{texto.length}/1500</span>
          </div>
          <div className="rounded-xl bg-[#e7f7ec] p-3">
            <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm">{previa}</div>
          </div>
        </section>
      </div>

      <div className="flex justify-end border-t border-border px-4 py-3">
        <Button onClick={() => setConfirmar(true)} disabled={isPending || nome.trim().length < 2 || texto.trim().length < 5 || !total}>
          <Send size={14} /> Revisar e enviar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title={`Enviar para ${total} ${total === 1 ? "lead" : "leads"}?`}
        description="As mensagens saem aos poucos, das 8h às 20h. Você pode pausar ou cancelar depois. Mande só para quem espera ouvir de você."
        confirmLabel="Criar disparo"
        pendingLabel="Criando..."
        confirmVariant="default"
        onConfirm={enviar}
        pending={isPending}
      />
    </>
  );
}
