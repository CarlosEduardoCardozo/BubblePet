"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Gift, MessageCircle, PawPrint, Send, Settings2, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { FidelidadeConfig } from "@/lib/fidelidade";
import { alternarFidelidade } from "./actions";
import { ConfigFidelidadeSheet } from "./ConfigFidelidadeSheet";

const ZONE = "America/Sao_Paulo";

export type LinhaCartao = {
  tutorId: string;
  tutorNome: string;
  pets: string[];
  carimbos: number;
  progresso: number;
  faltam: number;
  disponiveis: number;
  usados: number;
  ultimoCarimbo: string | null;
};

type Aba = "todos" | "premio" | "quase";

/** "Quase lá" = falta 1 ou 2 (ou 20% do cartão, se ele for grande). */
function quaseLa(l: LinhaCartao, meta: number): boolean {
  return l.disponiveis === 0 && l.progresso > 0 && l.faltam <= Math.max(2, Math.ceil(meta * 0.2));
}

export function FidelidadeView({
  config,
  linhas,
  servicos,
  avisosEnviados,
  whatsappConectado,
  erro,
}: {
  config: FidelidadeConfig;
  linhas: LinhaCartao[];
  servicos: { id: string; nome: string }[];
  avisosEnviados: number;
  whatsappConectado: boolean;
  erro: boolean;
}) {
  const [aba, setAba] = useState<Aba>("todos");
  const [busca, setBusca] = useState("");
  const [configAberta, setConfigAberta] = useState(false);
  const [pendente, startTransition] = useTransition();

  const comPremio = linhas.filter((l) => l.disponiveis > 0);
  const quase = linhas.filter((l) => quaseLa(l, config.meta));
  const premiosParaUsar = comPremio.reduce((s, l) => s + l.disponiveis, 0);
  const usados = linhas.reduce((s, l) => s + l.usados, 0);

  const termo = busca.trim().toLowerCase();
  const lista = (aba === "premio" ? comPremio : aba === "quase" ? quase : linhas)
    .filter((l) => !termo || l.tutorNome.toLowerCase().includes(termo) || l.pets.some((p) => p.toLowerCase().includes(termo)))
    .sort((a, b) => b.disponiveis - a.disponiveis || a.faltam - b.faltam || a.tutorNome.localeCompare(b.tutorNome));

  const nomesServicos = config.servico_ids
    ? servicos.filter((s) => config.servico_ids!.includes(s.id)).map((s) => s.nome.toLowerCase())
    : [];
  const desde = DateTime.fromISO(config.contar_desde, { zone: ZONE }).toFormat("dd/LL/yyyy");

  function alternar() {
    startTransition(async () => {
      const r = await alternarFidelidade(!config.ativo);
      if ("error" in r) toast.error(r.error);
      else toast.success(config.ativo ? "Programa de fidelidade desligado." : "Programa de fidelidade ligado!");
    });
  }

  const ABAS: { valor: Aba; label: string; n: number }[] = [
    { valor: "todos", label: "Todos", n: linhas.length },
    { valor: "premio", label: "Com prêmio", n: comPremio.length },
    { valor: "quase", label: "Quase lá", n: quase.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fidelidade"
        description="Cartão de carimbos: a cada atendimento pago o cliente ganha um carimbo e, ao completar o cartão, um prêmio."
      />

      <div className="glass flex flex-col gap-4 rounded-card p-5 md:flex-row md:items-center">
        <div className="flex flex-1 items-start gap-4">
          <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", config.ativo ? "bg-brand" : "bg-muted text-muted-foreground")}>
            <Gift size={22} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-bold">Programa de fidelidade {config.ativo ? "ligado" : "desligado"}</p>
            <p className="text-sm text-muted-foreground">
              A cada <b className="text-foreground">{config.meta} atendimentos pagos</b>, o cliente ganha{" "}
              <b className="text-foreground">{config.premio}</b>
              {config.desconto_pct < 100 ? ` (${config.desconto_pct}% de desconto)` : ""}.{" "}
              {nomesServicos.length ? `Contam: ${nomesServicos.join(", ")}.` : "Todos os serviços contam."} Banhos do plano não contam.
              Contando desde {desde}.
            </p>
            {config.ativo && config.avisar_whatsapp && !whatsappConectado && (
              <p className="text-sm font-medium text-destructive">
                O WhatsApp está desconectado: o aviso de prêmio só sai depois de conectar em{" "}
                <Link href="/configuracoes" className="underline">Configurações</Link>.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/configuracoes/mensagens" />}>
            <MessageCircle size={16} /> Textos
          </Button>
          <Button variant="outline" onClick={() => setConfigAberta(true)}>
            <Settings2 size={16} /> Regras
          </Button>
          <Button variant={config.ativo ? "outline" : "default"} onClick={alternar} disabled={pendente}>
            {config.ativo ? "Desligar" : "Ligar programa"}
          </Button>
        </div>
      </div>

      {erro && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">Não foi possível carregar os cartões.</p>}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Numero icon={Gift} titulo="Prêmios para usar" valor={String(premiosParaUsar)} dica={`${usados} já usados`} destaque />
        <Numero icon={Sparkles} titulo="Quase lá" valor={String(quase.length)} dica="clientes perto de completar o cartão" />
        <Numero icon={Users} titulo="Clientes no programa" valor={String(linhas.length)} dica="com pelo menos um carimbo" />
        <Numero icon={Send} titulo="Avisos de prêmio" valor={String(avisosEnviados)} dica={config.avisar_whatsapp ? "enviados no WhatsApp em 30 dias" : "aviso pelo WhatsApp desligado"} />
      </div>

      <p className="glass rounded-card px-5 py-3 text-sm text-muted-foreground">
        🎁 Para usar o prêmio, abra o atendimento na <Link href="/agenda" className="font-semibold text-primary underline">Agenda</Link> e
        toque em <b className="text-foreground">Usar prêmio</b>. O desconto entra sozinho no fechamento do mês.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {ABAS.map((a) => (
          <button
            key={a.valor}
            type="button"
            onClick={() => setAba(a.valor)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              aba === a.valor ? "bg-brand" : "glass text-muted-foreground hover:text-foreground"
            )}
          >
            {a.label}
            <span className={cn("rounded-full px-2 py-0.5 text-xs", aba === a.valor ? "bg-white/25" : "bg-muted")}>{a.n}</span>
          </button>
        ))}
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou pet..." className="ml-auto max-w-xs" />
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title={linhas.length === 0 ? (config.ativo ? "Nenhum carimbo ainda" : "Programa desligado") : "Ninguém por aqui"}
          description={
            linhas.length === 0
              ? config.ativo
                ? "Os carimbos aparecem conforme os atendimentos pagos acontecem."
                : "Ligue o programa para começar a contar os atendimentos."
              : "Tente outra aba ou busca."
          }
        />
      ) : (
        <div className="glass flex flex-col divide-y divide-border/70 overflow-hidden rounded-card">
          {lista.map((l) => (
            <div key={l.tutorId} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-[15px] font-bold">
                  {l.tutorNome}
                  {l.pets.length > 0 && <span className="font-medium text-muted-foreground"> · {l.pets.join(", ")}</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {l.carimbos} {l.carimbos === 1 ? "atendimento" : "atendimentos"} no programa
                  {l.ultimoCarimbo && ` · último em ${DateTime.fromISO(l.ultimoCarimbo).setZone(ZONE).toFormat("dd/LL")}`}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 md:w-72 md:items-end">
                <Carimbos meta={config.meta} progresso={l.progresso} />
                <p className="text-xs font-medium text-muted-foreground">
                  {l.disponiveis > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sun px-2 py-0.5 font-bold text-[#5c3d00]">
                      <Gift size={11} /> {l.disponiveis > 1 ? `${l.disponiveis} prêmios para usar` : "Prêmio para usar"}
                    </span>
                  ) : (
                    `${l.progresso} de ${config.meta} · faltam ${l.faltam}`
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* key: depois de salvar ou ligar, o formulário abre com as regras novas. */}
      <ConfigFidelidadeSheet key={JSON.stringify(config)} open={configAberta} onOpenChange={setConfigAberta} config={config} servicos={servicos} />
    </div>
  );
}

/** Bolinhas do cartão; cartão grande vira barra. */
function Carimbos({ meta, progresso }: { meta: number; progresso: number }) {
  if (meta > 12) {
    return (
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted md:w-56" aria-label={`${progresso} de ${meta}`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${(progresso / meta) * 100}%` }} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" aria-label={`${progresso} de ${meta}`}>
      {Array.from({ length: meta }, (_, i) => (
        <span
          key={i}
          className={cn(
            "flex size-5 items-center justify-center rounded-full border",
            i < progresso ? "border-primary bg-primary text-white" : "border-border bg-white/60"
          )}
        >
          {i < progresso && <PawPrint size={11} />}
        </span>
      ))}
    </div>
  );
}

function Numero({
  icon: Icon,
  titulo,
  valor,
  dica,
  destaque = false,
}: {
  icon: React.ElementType;
  titulo: string;
  valor: string;
  dica: string;
  destaque?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-card p-5", destaque ? "bg-brand" : "glass")}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{titulo}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-full", destaque ? "bg-white/20" : "bg-secondary text-primary")}>
          <Icon size={16} />
        </span>
      </div>
      <div className="text-4xl font-extrabold tracking-tight tabular-nums">{valor}</div>
      <div className={cn("text-xs font-medium", destaque ? "text-white/80" : "text-muted-foreground")}>{dica}</div>
    </div>
  );
}
