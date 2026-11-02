"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Copy, Rocket, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MISSOES, PONTOS_POR_MISSAO, missoesFeitas, nivelDe, type OnboardingSalvo } from "@/lib/onboarding";
import {
  celebrarMissoes,
  dispensarOnboarding,
  estadoOnboarding,
  marcarBoasVindas,
  marcarLinkCompartilhado,
  type EstadoOnboarding,
} from "@/app/(app)/onboarding-actions";

const CORES = ["#7c3aed", "#ffc21a", "#ec4899", "#22c55e", "#3b82f6", "#f97316"];

type Peca = { id: number; cor: string; esq: number; dx: number; dy: number; rot: number; atraso: number };

function gerarPecas(): Peca[] {
  return Array.from({ length: 36 }, (_, id) => ({
    id,
    cor: CORES[id % CORES.length],
    esq: 15 + Math.random() * 70,
    dx: (Math.random() - 0.5) * 420,
    dy: 160 + Math.random() * 380,
    rot: (Math.random() - 0.5) * 900,
    atraso: Math.random() * 0.35,
  }));
}

/** Chuva de confete por cima de tudo; o componente só existe enquanto a comemoração dura. */
function Confete() {
  const [pecas] = useState(gerarPecas);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pecas.map((p) => (
        <span
          key={p.id}
          className="bp-confete absolute top-[22%] block h-2.5 w-1.5 rounded-[2px]"
          style={
            {
              left: `${p.esq}%`,
              background: p.cor,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
              animation: `bp-confete 1.9s cubic-bezier(.2,.7,.3,1) ${p.atraso}s forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function Anel({ feitas, total, tamanho = 44 }: { feitas: number; total: number; tamanho?: number }) {
  const r = (tamanho - 6) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} className="-rotate-90" aria-hidden>
      <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={5} />
      <circle
        cx={tamanho / 2}
        cy={tamanho / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - feitas / total)}
        className="transition-[stroke-dashoffset] duration-700"
      />
    </svg>
  );
}

/**
 * Primeiros passos do teste grátis: missões com pontos e nível, comemoração
 * a cada missão cumprida e botão para pular. Fica num botão flutuante;
 * o que já foi feito é marcado sozinho, olhando os dados do petshop.
 */
export function PrimeirosPassos({ diasDeTeste }: { diasDeTeste: number | null }) {
  const [estado, setEstado] = useState<EstadoOnboarding | null>(null);
  const [salvo, setSalvo] = useState<OnboardingSalvo>({});
  const [aberto, setAberto] = useState(false);
  const [festa, setFesta] = useState<{ id: number; pontos: number; nomes: string[] } | null>(null);
  const [, startTransition] = useTransition();

  // Guarda o estado e, se uma missão nova foi cumprida, comemora uma vez só.
  const aplicarEstado = useCallback((r: EstadoOnboarding) => {
    setEstado(r);
    setSalvo(r.salvo);
    const feitasAgora = missoesFeitas(r.status, r.salvo);
    const novas = MISSOES.filter((m) => feitasAgora.has(m.id) && !(r.salvo.celebrados ?? []).includes(m.id));
    if (novas.length === 0) return;
    const ids = novas.map((m) => m.id);
    setSalvo((s) => ({ ...s, celebrados: [...(s.celebrados ?? []), ...ids] }));
    void celebrarMissoes(ids);
    // Só faz festa depois da apresentação: missão já cumprida antes não vira festa na primeira tela.
    if (r.salvo.boas_vindas_em || r.salvo.dispensado_em) {
      setFesta({ id: Date.now(), pontos: novas.length * PONTOS_POR_MISSAO, nomes: novas.map((m) => m.titulo) });
      setTimeout(() => setFesta(null), 3800);
    }
  }, []);

  // Carrega depois que a página já apareceu, ao trocar de tela (assim a missão cumprida
  // em outra página é percebida) e quando a pessoa volta para a aba.
  const pathname = usePathname();
  useEffect(() => {
    let vivo = true;
    const carregar = () =>
      estadoOnboarding().then((r) => {
        if (vivo && !("error" in r)) aplicarEstado(r);
      });
    void carregar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [aplicarEstado, pathname]);

  const feitas = estado ? missoesFeitas(estado.status, salvo) : new Set<string>();
  const total = MISSOES.length;
  const concluidas = feitas.size;
  const pontos = concluidas * PONTOS_POR_MISSAO;
  const { atual, proximo } = nivelDe(pontos);
  const completo = concluidas === total;
  // Primeira vez: dá as boas-vindas (some ao começar ou pular).
  const boasVindas = !!estado && !salvo.boas_vindas_em && !salvo.dispensado_em;

  function comecar() {
    setSalvo((s) => ({ ...s, boas_vindas_em: new Date().toISOString() }));
    startTransition(async () => {
      await marcarBoasVindas();
    });
    setAberto(true);
  }

  function pular() {
    setAberto(false);
    setSalvo((s) => ({ ...s, dispensado_em: new Date().toISOString(), boas_vindas_em: s.boas_vindas_em ?? new Date().toISOString() }));
    startTransition(async () => {
      await dispensarOnboarding(true);
    });
  }

  function reabrir() {
    setSalvo((s) => ({ ...s, dispensado_em: undefined, boas_vindas_em: s.boas_vindas_em ?? new Date().toISOString() }));
    startTransition(async () => {
      await dispensarOnboarding(false);
    });
    setAberto(true);
  }

  async function copiarLink() {
    if (!estado?.slug) return;
    const url = `${window.location.origin}/agendar/${estado.slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* sem permissão de área de transferência: o link aparece abaixo mesmo assim */
    }
    toast.success("Link copiado! Cole no WhatsApp e no Instagram do seu petshop.");
    startTransition(async () => {
      await marcarLinkCompartilhado();
      // Recarrega para a comemoração acontecer na hora.
      const r = await estadoOnboarding();
      if (!("error" in r)) aplicarEstado(r);
    });
  }

  if (!estado) return null;
  // Terminou e fechou: some de vez.
  if (completo && salvo.dispensado_em) return null;
  const compacto = !!salvo.dispensado_em && !completo;

  return (
    <>
      {festa && <Confete key={festa.id} />}

      {festa && (
        <div
          role="status"
          className="fixed bottom-24 right-4 z-[70] flex max-w-xs items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_20px_50px_-12px_rgba(76,29,149,0.45)] ring-1 ring-primary/20 max-sm:left-4 max-sm:max-w-none"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sun text-[#5c3d00]">
            <Sparkles size={18} />
          </span>
          <div className="flex flex-col">
            <strong className="text-sm">+{festa.pontos} pontos! 🎉</strong>
            <span className="text-xs text-muted-foreground">{festa.nomes.join(" · ")}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => (salvo.dispensado_em && !completo ? reabrir() : setAberto(true))}
        aria-label={`Primeiros passos: ${concluidas} de ${total}`}
        className={cn(
          "fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-full bg-white text-primary shadow-[0_14px_36px_-10px_rgba(76,29,149,0.5)] ring-1 ring-primary/15 transition-transform hover:scale-[1.03]",
          compacto ? "p-1" : "py-1.5 pr-4 pl-1.5"
        )}
      >
        <span className="relative flex size-11 items-center justify-center">
          <Anel feitas={concluidas} total={total} />
          <span className="absolute text-sm font-extrabold text-foreground">{completo ? "🏆" : `${concluidas}/${total}`}</span>
        </span>
        {!compacto && (
          <span className="flex flex-col text-left leading-tight">
            <span className="text-sm font-bold text-foreground">{completo ? "Tudo pronto!" : "Primeiros passos"}</span>
            <span className="text-[11px] text-muted-foreground">
              {atual.emoji} {atual.nome} · {pontos} pts
            </span>
          </span>
        )}
      </button>

      <Dialog open={boasVindas} onOpenChange={(v) => !v && pular()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket size={20} className="text-primary" /> Bem-vindo ao BubblePet! 🐾
            </DialogTitle>
            <DialogDescription>
              Em uns 5 minutos seu petshop fica pronto para usar. São {total} missões rápidas: a cada uma você ganha pontos e sobe de nível,
              de <strong>Filhote</strong> até <strong>Mestre dos Banhos</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={pular}>
              Pular por agora
            </Button>
            <Button onClick={comecar}>Começar as missões</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Primeiros passos</SheetTitle>
            <SheetDescription>Cumpra as missões e deixe o petshop pronto para trabalhar.</SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <div className="flex items-center gap-4 rounded-2xl bg-brand p-4">
              <span className="text-4xl" aria-hidden>
                {atual.emoji}
              </span>
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-sm font-extrabold">Nível: {atual.nome}</span>
                <div className="h-2 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${(concluidas / total) * 100}%` }} />
                </div>
                <span className="text-xs text-white/85">
                  {pontos} pontos{proximo ? ` · faltam ${proximo.minimo - pontos} para ${proximo.nome}` : " · nível máximo!"}
                </span>
              </div>
            </div>

            <ol className="flex flex-col gap-2">
              {MISSOES.map((m) => {
                const feita = feitas.has(m.id);
                return (
                  <li
                    key={m.id}
                    className={cn("flex items-start gap-3 rounded-2xl border px-3.5 py-3", feita ? "border-emerald-200 bg-emerald-50/60" : "border-border bg-white/70")}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        feita ? "bg-emerald-500 text-white" : "border border-border text-muted-foreground"
                      )}
                    >
                      {feita ? <Check size={14} /> : MISSOES.indexOf(m) + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div>
                        <p className={cn("text-sm font-semibold", feita && "text-emerald-800 line-through decoration-emerald-400/60")}>{m.titulo}</p>
                        {!feita && <p className="text-xs text-muted-foreground">{m.descricao}</p>}
                      </div>
                      {!feita &&
                        (m.id === "link" ? (
                          <Button size="sm" variant="outline" className="self-start" onClick={copiarLink} disabled={!estado.slug}>
                            <Copy size={14} /> {m.cta}
                          </Button>
                        ) : (
                          <Link
                            href={m.href}
                            onClick={() => setAberto(false)}
                            className="flex items-center gap-0.5 self-start text-xs font-bold text-primary hover:underline"
                          >
                            {m.cta} <ChevronRight size={14} />
                          </Link>
                        ))}
                    </div>
                    <span className={cn("shrink-0 text-xs font-bold", feita ? "text-emerald-700" : "text-muted-foreground")}>+{PONTOS_POR_MISSAO}</span>
                  </li>
                );
              })}
            </ol>

            {completo ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-sun/30 p-4 text-sm">
                <p className="flex items-center gap-2 font-bold text-[#5c3d00]">
                  <Trophy size={18} /> Você é Mestre dos Banhos! 🏆
                </p>
                <p className="text-xs text-[#5c3d00]/85">Seu petshop está pronto. {diasDeTeste != null ? "Assine para continuar depois do teste." : ""}</p>
                {diasDeTeste != null && (
                  <Link href="/assinar" className="self-start rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground">
                    Assinar agora
                  </Link>
                )}
              </div>
            ) : (
              diasDeTeste != null && (
                <Link href="/assinar" className="flex items-center justify-between rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs">
                  <span>
                    <strong className="text-sm">Faltam {diasDeTeste} {diasDeTeste === 1 ? "dia" : "dias"} de teste grátis.</strong>
                    <span className="block text-muted-foreground">Assine e continue com tudo organizado.</span>
                  </span>
                  <ChevronRight size={16} className="text-primary" />
                </Link>
              )
            )}
          </div>

          <div className="flex justify-end border-t border-border px-4 py-3">
            <Button variant="ghost" size="sm" onClick={pular}>
              {completo ? "Fechar" : "Pular por agora"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
