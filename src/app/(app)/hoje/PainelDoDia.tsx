"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, MessageCircle, PawPrint, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { PORTES } from "@/lib/servico-preco";
import { ETAPA_LABEL, PROXIMA_ACAO, etapaAnterior, proximaEtapa, type Etapa } from "@/lib/painel-dia";
import { marcarFaltou, mudarEtapa } from "./actions";

const ZONE = "America/Sao_Paulo";
const CHAVE_AVISAR = "bubblepet:painel-avisar-pronto";

export type CartaoDia = {
  id: string;
  inicio: string;
  fim: string;
  status: string;
  etapa: Etapa | null;
  etapaEm: string | null;
  prontoAvisadoEm: string | null;
  plano: boolean;
  adicionais: string[];
  petNome: string;
  porte: string | null;
  observacoes: string | null;
  tutorNome: string;
  telefone: string;
  servicoNome: string;
};

type Coluna = Etapa | "aguardando";
const COLUNAS: Coluna[] = ["aguardando", "chegou", "banho", "secagem", "pronto"];

const COR: Record<Coluna, string> = {
  aguardando: "bg-muted-foreground/40",
  chegou: "bg-[#3b82f6]",
  banho: "bg-[#7c3aed]",
  secagem: "bg-[#ec4899]",
  pronto: "bg-[#ffc21a]",
  entregue: "bg-success",
};

const hora = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toFormat("HH:mm");

function colunaDo(c: CartaoDia): Coluna {
  return c.etapa ?? "aguardando";
}

export function PainelDoDia({
  cartoes,
  dataLonga,
  whatsappConectado,
}: {
  cartoes: CartaoDia[];
  dataLonga: string;
  whatsappConectado: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [movendo, setMovendo] = useState<string | null>(null);
  const [colunaMobile, setColunaMobile] = useState<Coluna>("aguardando");
  const [avisar, setAvisar] = useState(true);

  // Preferência deste aparelho: avisar ou não o tutor no "pronto".
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE_AVISAR);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lê a preferência salva só no navegador
      if (salvo !== null) setAvisar(salvo === "1");
    } catch {}
  }, []);

  // A recepção vê o que o banho e tosa mudou, sem recarregar a página.
  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(t);
  }, [router]);

  function trocarAvisar(v: boolean) {
    setAvisar(v);
    try {
      window.localStorage.setItem(CHAVE_AVISAR, v ? "1" : "0");
    } catch {}
  }

  const ativos = cartoes.filter((c) => c.status !== "faltou");
  const entregues = ativos.filter((c) => c.etapa === "entregue");
  const faltaram = cartoes.filter((c) => c.status === "faltou");
  const daColuna = (col: Coluna) => ativos.filter((c) => colunaDo(c) === col);

  function mover(c: CartaoDia, etapa: Etapa | null) {
    setMovendo(c.id);
    startTransition(async () => {
      const r = await mudarEtapa(c.id, etapa, avisar);
      setMovendo(null);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      // No celular a tela acompanha o cartão até a etapa nova.
      if (etapa !== "entregue") setColunaMobile(etapa ?? "aguardando");
      if (etapa === "pronto") {
        if (r.aviso === "enviado") toast.success(`${c.petNome} pronto. O tutor foi avisado no WhatsApp.`);
        else if (r.aviso === "whatsapp_off") toast.warning(`${c.petNome} pronto. WhatsApp desconectado: avise o tutor por telefone.`);
        else if (r.erroAviso) toast.error(`${c.petNome} pronto, mas o aviso não saiu: ${r.erroAviso}`);
        else if (r.aviso === "ja_avisado") toast.success(`${c.petNome} pronto (o tutor já tinha sido avisado).`);
        else toast.success(`${c.petNome} pronto.`);
      } else if (etapa === "entregue") {
        toast.success(`${c.petNome} entregue. Atendimento concluído.`);
      }
      router.refresh();
    });
  }

  function faltou(c: CartaoDia) {
    setMovendo(c.id);
    startTransition(async () => {
      const r = await marcarFaltou(c.id);
      setMovendo(null);
      if ("error" in r) toast.error(r.error);
      else toast.success(`${c.petNome} marcado como falta.`);
      router.refresh();
    });
  }

  const resumo = `${ativos.length} atendimento${ativos.length === 1 ? "" : "s"} · ${entregues.length} entregue${entregues.length === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hoje"
        description={`${dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)} · ${resumo}`}
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/agenda" />}>
            <CalendarDays size={16} /> Agenda
          </Button>
        }
      />

      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-card px-5 py-4">
        <Label className="flex items-center gap-2.5 font-medium">
          <Checkbox checked={avisar} onCheckedChange={(v) => trocarAvisar(v === true)} />
          Avisar o tutor no WhatsApp quando o pet ficar pronto
        </Label>
        {!whatsappConectado && (
          <span className="text-sm font-medium text-destructive">
            WhatsApp desconectado: os avisos não saem. <Link href="/configuracoes" className="underline">Conectar</Link>
          </span>
        )}
      </div>

      {ativos.length === 0 && faltaram.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title="Nenhum atendimento hoje"
          description="Os pets marcados para hoje aparecem aqui, separados por etapa."
          action={
            <Button nativeButton={false} render={<Link href="/agenda" />}>
              Abrir a agenda
            </Button>
          }
        />
      ) : (
        <>
          {/* Celular: escolhe a etapa e vê os cartões dela. */}
          <div className="flex gap-2 overflow-x-auto pb-1 xl:hidden">
            {COLUNAS.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => setColunaMobile(col)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold",
                  colunaMobile === col ? "bg-brand" : "glass text-muted-foreground"
                )}
              >
                {ETAPA_LABEL[col]}
                <span className={cn("rounded-full px-2 py-0.5 text-xs", colunaMobile === col ? "bg-white/25" : "bg-muted")}>
                  {daColuna(col).length}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            {COLUNAS.map((col) => (
              <div key={col} className={cn("flex flex-col gap-3", col !== colunaMobile && "hidden xl:flex")}>
                <div className="hidden items-center gap-2 px-1 xl:flex">
                  <span className={cn("size-2.5 rounded-full", COR[col])} />
                  <span className="text-sm font-bold">{ETAPA_LABEL[col]}</span>
                  <span className="text-xs font-semibold text-muted-foreground">{daColuna(col).length}</span>
                </div>
                {daColuna(col).length === 0 ? (
                  <div className="rounded-card border-2 border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum pet aqui
                  </div>
                ) : (
                  daColuna(col).map((c) => (
                    <Cartao
                      key={c.id}
                      c={c}
                      ocupado={isPending && movendo === c.id}
                      onAvancar={() => mover(c, proximaEtapa(c.etapa))}
                      onVoltar={() => mover(c, etapaAnterior(c.etapa))}
                      onFaltou={() => faltou(c)}
                    />
                  ))
                )}
              </div>
            ))}
          </div>

          {entregues.length > 0 && (
            <div className="glass flex flex-col gap-2 rounded-card px-5 py-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <CheckCircle2 size={16} className="text-success" /> Entregues hoje ({entregues.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {entregues.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => mover(c, "pronto")}
                    title="Desfazer entrega"
                    className="rounded-full bg-success/12 px-3 py-1.5 text-sm font-semibold text-success hover:bg-success/20"
                  >
                    {c.petNome} · {c.etapaEm ? hora(c.etapaEm) : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {faltaram.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Faltaram hoje: {faltaram.map((c) => c.petNome).join(", ")}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Cartao({
  c,
  ocupado,
  onAvancar,
  onVoltar,
  onFaltou,
}: {
  c: CartaoDia;
  ocupado: boolean;
  onAvancar: () => void;
  onVoltar: () => void;
  onFaltou: () => void;
}) {
  const col = colunaDo(c);
  const acao = PROXIMA_ACAO[col];
  const porte = PORTES.find((p) => p.valor === c.porte)?.label;
  const whats = c.telefone ? `https://wa.me/${c.telefone.replace(/\D/g, "")}` : null;

  return (
    <div className={cn("glass flex flex-col gap-3 rounded-card p-4 transition-opacity", ocupado && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-primary tabular-nums">
            {hora(c.inicio)} – {hora(c.fim)}
          </p>
          <p className="truncate text-lg font-extrabold tracking-tight">{c.petNome}</p>
          <p className="truncate text-sm text-muted-foreground">
            {c.servicoNome}
            {porte ? ` · ${porte}` : ""}
          </p>
        </div>
        {c.plano && <span className="shrink-0 rounded-full bg-sun px-2 py-0.5 text-[11px] font-bold">plano</span>}
      </div>

      {c.observacoes && (
        <p className="rounded-xl bg-[#fff3c4] px-3 py-2 text-xs font-medium text-[#5c3d00]">{c.observacoes}</p>
      )}
      {c.adicionais.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.adicionais.map((a) => (
            <span key={a} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-primary">+ {a}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{c.tutorNome}</span>
        {whats && (
          <a href={whats} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 font-semibold text-success hover:underline">
            <MessageCircle size={13} /> WhatsApp
          </a>
        )}
      </div>
      {col === "pronto" && (
        <p className="text-xs font-semibold text-[#5c3d00]">
          {c.prontoAvisadoEm ? `Tutor avisado às ${hora(c.prontoAvisadoEm)}` : "Tutor ainda não avisado"}
        </p>
      )}

      <div className="flex gap-2">
        {c.etapa && (
          <Button size="icon-sm" variant="outline" onClick={onVoltar} disabled={ocupado} aria-label="Voltar etapa" title="Voltar etapa">
            <ArrowLeft size={14} />
          </Button>
        )}
        {acao && (
          <Button size="sm" className="flex-1" onClick={onAvancar} disabled={ocupado} variant={col === "secagem" ? "sun" : "default"}>
            {acao} <ChevronRight size={14} />
          </Button>
        )}
        {col === "aguardando" && (
          <Button size="icon-sm" variant="ghost" onClick={onFaltou} disabled={ocupado} aria-label="Não veio" title="Não veio">
            <UserX size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
