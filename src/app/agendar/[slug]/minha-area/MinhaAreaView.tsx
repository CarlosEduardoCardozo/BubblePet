"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarPlus, FileText, Gift, Loader2, MessageCircle, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCentavos } from "@/lib/currency";
import type { AreaDoTutor, ProximoAtendimento } from "@/lib/publico/area";
import { sairSessao } from "../actions";
import { cancelarPeloTutor, horariosParaRemarcar, remarcarPeloTutor } from "./actions";

const ZONE = "America/Sao_Paulo";

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card glass p-5 shadow-[0_14px_40px_-16px_rgba(76,29,149,0.22)]">
      <h2 className="mb-3 text-lg font-semibold [font-family:var(--font-display)]">{titulo}</h2>
      {children}
    </section>
  );
}

function quando(iso: string): string {
  const dt = DateTime.fromISO(iso).setZone(ZONE).setLocale("pt-BR");
  return `${dt.toFormat("ccc, dd/LL")} às ${dt.toFormat("HH:mm")}`.replace(/^./, (c) => c.toUpperCase());
}

function mesExtenso(competencia: string): string {
  return DateTime.fromISO(competencia).setLocale("pt-BR").toFormat("LLLL 'de' yyyy").replace(/^./, (c) => c.toUpperCase());
}

export function MinhaAreaView({
  slug,
  area,
  petshop,
  dias,
}: {
  slug: string;
  area: AreaDoTutor;
  petshop: { nome: string; telefone: string | null };
  dias: string[];
}) {
  const router = useRouter();
  const [, startSair] = useTransition();
  const primeiroNome = area.tutorNome.split(" ")[0];
  const wa = petshop.telefone ? `https://wa.me/${petshop.telefone.replace(/\D/g, "")}` : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          Oi, <span className="font-medium text-foreground">{primeiroNome}</span> 👋
        </p>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() =>
            startSair(async () => {
              await sairSessao(slug);
              router.push(`/agendar/${slug}`);
            })
          }
        >
          Sair
        </button>
      </div>

      <Button nativeButton={false} render={<Link href={`/agendar/${slug}`} />} className="w-full">
        <CalendarPlus size={16} /> Agendar um banho
      </Button>

      <Cartao titulo="Próximos banhos">
        {area.proximos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum banho marcado por enquanto.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {area.proximos.map((p) => (
              <Proximo key={p.id} slug={slug} item={p} dias={dias} whatsapp={wa} onChanged={() => router.refresh()} />
            ))}
          </div>
        )}
      </Cartao>

      {area.planos.length > 0 && (
        <Cartao titulo="Meu plano">
          <div className="flex flex-col gap-2">
            {area.planos.map((p) => (
              <div key={p.petNome} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">{p.petNome}</span>
                  <span className="text-muted-foreground"> · {p.planoNome}</span>
                </span>
                <span className="font-semibold text-primary">
                  {p.saldo} de {p.creditosMes} {p.creditosMes === 1 ? "banho" : "banhos"}
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Banhos que ainda restam neste mês.</p>
          </div>
        </Cartao>
      )}

      {area.fidelidade && (
        <Cartao titulo="Cartão fidelidade">
          <div className="flex flex-col gap-3">
            {area.fidelidade.meta <= 12 ? (
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: area.fidelidade.meta }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border",
                      i < area.fidelidade!.progresso ? "border-primary bg-primary text-white" : "border-border bg-white/60"
                    )}
                  >
                    {i < area.fidelidade!.progresso && <PawPrint size={15} />}
                  </span>
                ))}
              </div>
            ) : (
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(area.fidelidade.progresso / area.fidelidade.meta) * 100}%` }}
                />
              </div>
            )}
            <p className="flex items-start gap-2 text-sm">
              {area.fidelidade.disponiveis > 0 && <Gift size={16} className="mt-0.5 shrink-0 text-primary" />}
              <span>{area.fidelidade.frase.replace(/\*/g, "")}</span>
            </p>
          </div>
        </Cartao>
      )}

      <Cartao titulo="Histórico">
        {area.historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Os banhos já feitos aparecem aqui.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {area.historico.map((h) => (
              <div key={h.id} className="flex flex-col gap-2 rounded-xl bg-white/60 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold">{h.petNome}</span>
                    <span className="text-muted-foreground"> · {h.servicoNome}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {DateTime.fromISO(h.inicioISO).setZone(ZONE).toFormat("dd/LL/yyyy")}
                  </span>
                </div>
                {h.registro && (
                  <div className="flex flex-col gap-2 rounded-lg bg-sun/30 p-2.5">
                    <p className="text-xs font-semibold text-[#5c3d00]">
                      Anotado na chegada{h.registro.condicoes.length ? `: ${h.registro.condicoes.join(", ").toLowerCase()}` : ""}
                    </p>
                    {h.registro.observacao && <p className="text-xs">{h.registro.observacao}</p>}
                    {h.registro.midias.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {h.registro.midias.map((m, i) =>
                          m.tipo === "foto" ? (
                            <a key={i} href={m.url} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.url} alt="Foto do atendimento" className="size-20 rounded-lg object-cover" />
                            </a>
                          ) : (
                            <video key={i} src={m.url} controls preload="metadata" className="size-20 rounded-lg object-cover" />
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Cartao>

      {area.extratos.length > 0 && (
        <Cartao titulo="Extratos">
          <div className="flex flex-col gap-2">
            {area.extratos.map((e) => (
              <a
                key={e.id}
                href={`/agendar/${slug}/extrato/${e.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2.5 text-sm hover:bg-white"
              >
                <span className="flex items-center gap-2">
                  <FileText size={16} className="text-primary" />
                  <span className="font-medium">{mesExtenso(e.competencia)}</span>
                </span>
                <span className="text-right">
                  <span className="font-semibold">{formatCentavos(e.totalCentavos)}</span>
                  <span className={cn("block text-xs", e.pago ? "text-primary" : "text-muted-foreground")}>
                    {e.pago ? "Pago" : "Em aberto"}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </Cartao>
      )}

      {wa && (
        <Button variant="outline" nativeButton={false} render={<a href={wa} />} className="w-full">
          <MessageCircle size={16} /> Falar com o petshop
        </Button>
      )}
    </div>
  );
}

function Proximo({
  slug,
  item,
  dias,
  whatsapp,
  onChanged,
}: {
  slug: string;
  item: ProximoAtendimento;
  dias: string[];
  whatsapp: string | null;
  onChanged: () => void;
}) {
  const [modo, setModo] = useState<"nenhum" | "remarcar" | "cancelar">("nenhum");
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [carregando, startHorarios] = useTransition();

  function escolherDia(d: string) {
    setDia(d);
    setHora("");
    setHorarios(null);
    startHorarios(async () => setHorarios(await horariosParaRemarcar(slug, item.id, d)));
  }

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setModo("nenhum");
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/60 px-3 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-semibold">
            {item.petNome} · {item.servicoNome}
          </span>
          <span className="text-muted-foreground">{quando(item.inicioISO)}</span>
        </div>
        <span className="shrink-0 text-right text-xs font-medium text-primary">
          {item.coberto ? "Plano" : item.valorCentavos != null ? formatCentavos(item.valorCentavos) : ""}
          {item.confirmado && <span className="block text-muted-foreground">Confirmado</span>}
        </span>
      </div>

      {modo === "nenhum" &&
        (item.podeAlterar ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setModo("remarcar")}>
              Remarcar
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setModo("cancelar")}>
              Cancelar
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Faltam poucas horas: para alterar, {whatsapp ? <a href={whatsapp} className="underline">fale com o petshop</a> : "fale com o petshop"}.
          </p>
        ))}

      {modo === "cancelar" && (
        <div className="flex flex-col gap-2 rounded-lg bg-destructive/5 p-3">
          <p className="text-sm">Cancelar este banho?{item.coberto ? " O crédito do plano volta." : ""}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={isPending} onClick={() => executar(() => cancelarPeloTutor(slug, item.id))}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : "Sim, cancelar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setModo("nenhum")}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {modo === "remarcar" && (
        <div className="flex flex-col gap-3 rounded-lg bg-primary/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Novo dia</p>
          <div className="flex flex-wrap gap-1.5">
            {dias.map((d) => {
              const dt = DateTime.fromISO(d, { zone: ZONE }).setLocale("pt-BR");
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => escolherDia(d)}
                  className={cn(
                    "rounded-xl border px-2.5 py-1.5 text-xs font-semibold",
                    dia === d ? "border-primary bg-primary text-white" : "border-border bg-white"
                  )}
                >
                  {dt.toFormat("ccc dd/LL").replace(".", "")}
                </button>
              );
            })}
          </div>
          {dia && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Horário</p>
              {carregando || horarios === null ? (
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              ) : horarios.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem horários nesse dia. Tente outro.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {horarios.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHora(h)}
                      className={cn(
                        "rounded-xl border px-3 py-1.5 text-xs font-semibold",
                        hora === h ? "border-primary bg-primary text-white" : "border-border bg-white"
                      )}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={!dia || !hora || isPending} onClick={() => executar(() => remarcarPeloTutor(slug, item.id, dia, hora))}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : "Confirmar novo horário"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setModo("nenhum")}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
