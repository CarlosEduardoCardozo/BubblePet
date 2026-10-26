"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { toast } from "sonner";
import {
  BellOff,
  BellRing,
  CalendarPlus,
  Clock,
  MessageCircle,
  PawPrint,
  Send,
  Settings2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCentavos } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { RetornoConfig } from "@/lib/retorno/calcular";
import { alternarRetornoAutomatico, enviarAgoraAction, pausarRetornoPet } from "./actions";
import { ConfigRetornoSheet } from "./ConfigRetornoSheet";

const ZONE = "America/Sao_Paulo";

type Grupo = "hora_de_voltar" | "atrasado" | "plano_sobrando" | "em_dia" | "sumido" | "agendado";

export type Linha = {
  grupo: Grupo;
  petId: string;
  petNome: string;
  tutorNome: string;
  pausado: boolean;
  intervaloDias: number | null;
  intervaloEstimado: boolean;
  visitas: number;
  ultimaVisita: string | null;
  diasDesdeUltima: number | null;
  proxima: string | null;
  diasParaVoltar: number | null;
  avisoPrevisto: string | null;
  servicoNome: string;
  valorCentavos: number;
  plano: { nome: string; saldo: number; creditosMes: number } | null;
  mensagem: {
    status: "pendente" | "enviada" | "cancelada" | "erro";
    tipo: "retorno" | "plano_sobrando";
    agendadaPara: string;
    enviadaEm: string | null;
    erro: string | null;
  } | null;
};

const ABAS: { grupo: Grupo; label: string; vazio: string }[] = [
  { grupo: "hora_de_voltar", label: "Na hora de voltar", vazio: "Ninguém está na hora de voltar agora." },
  { grupo: "atrasado", label: "Atrasados", vazio: "Nenhum cliente atrasado. 🎉" },
  { grupo: "plano_sobrando", label: "Plano sobrando", vazio: "Nenhum plano com banho sobrando no fim do mês." },
  { grupo: "em_dia", label: "Próximos avisos", vazio: "Nenhum aviso previsto." },
  { grupo: "sumido", label: "Sumidos", vazio: "Ninguém sumido há mais de 2 meses." },
  { grupo: "agendado", label: "Já agendados", vazio: "Nenhum pet com horário marcado." },
];

function data(iso: string | null, formato = "dd/LL") {
  return iso ? DateTime.fromISO(iso, { zone: ZONE }).setLocale("pt-BR").toFormat(formato) : "—";
}

function situacaoMensagem(l: Linha, ativo: boolean): { texto: string; tom: "roxo" | "verde" | "cinza" | "vermelho" | "amarelo" } {
  if (l.pausado) return { texto: "Pausado — não recebe automático", tom: "cinza" };
  const m = l.mensagem;
  if (m?.status === "pendente") {
    const quando = DateTime.fromISO(m.agendadaPara, { zone: ZONE });
    const hoje = quando.hasSame(DateTime.now().setZone(ZONE), "day");
    return { texto: `Mensagem sai ${hoje ? "hoje" : quando.toFormat("dd/LL")} às ${quando.toFormat("HH:mm")}`, tom: "roxo" };
  }
  if (m?.status === "enviada" && m.enviadaEm) return { texto: `Mensagem enviada em ${data(m.enviadaEm)}`, tom: "verde" };
  if (m?.status === "erro") return { texto: "Erro no último envio", tom: "vermelho" };
  if (l.grupo === "agendado") return { texto: "Já tem horário marcado", tom: "verde" };
  if (l.grupo === "sumido") return { texto: "Sem aviso automático — mande manualmente", tom: "cinza" };
  if (l.grupo === "em_dia") {
    return ativo
      ? { texto: `Aviso previsto em ${data(l.avisoPrevisto)}`, tom: "amarelo" }
      : { texto: `Previsto voltar em ${data(l.proxima)}`, tom: "cinza" };
  }
  return ativo
    ? { texto: "Entra na fila do próximo envio", tom: "amarelo" }
    : { texto: "Envio automático desligado", tom: "cinza" };
}

const TOM = {
  roxo: "bg-secondary text-primary",
  verde: "bg-success/12 text-success",
  cinza: "bg-muted text-muted-foreground",
  vermelho: "bg-destructive/10 text-destructive",
  amarelo: "bg-[#ffc21a]/20 text-[#5c3d00]",
};

export function OportunidadesView({
  linhas,
  config,
  whatsappConectado,
  voltaram,
}: {
  linhas: Linha[];
  config: RetornoConfig;
  whatsappConectado: boolean;
  voltaram: { petId: string; petNome: string; enviadaEm: string; agendadoEm: string; valorCentavos: number }[];
}) {
  const [aba, setAba] = useState<Grupo>("hora_de_voltar");
  const [configAberta, setConfigAberta] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const porGrupo = (g: Grupo) => linhas.filter((l) => l.grupo === g);
  const naHora = porGrupo("hora_de_voltar");
  const atrasados = porGrupo("atrasado");
  const sobrando = porGrupo("plano_sobrando");
  const soma = (ls: Linha[]) => ls.reduce((s, l) => s + l.valorCentavos, 0);
  const recuperado = voltaram.reduce((s, v) => s + v.valorCentavos, 0);

  const lista = porGrupo(aba).sort((a, b) =>
    aba === "em_dia"
      ? (a.avisoPrevisto ?? "").localeCompare(b.avisoPrevisto ?? "")
      : (a.diasParaVoltar ?? 0) - (b.diasParaVoltar ?? 0)
  );

  function alternar() {
    startTransition(async () => {
      const r = await alternarRetornoAutomatico(!config.ativo);
      if ("error" in r) toast.error(r.error);
      else toast.success(config.ativo ? "Envio automático desligado." : "Envio automático ligado. A fila de hoje é montada nos próximos minutos.");
    });
  }

  function enviar(l: Linha) {
    setOcupado(l.petId);
    startTransition(async () => {
      const r = await enviarAgoraAction(l.petId, l.grupo === "plano_sobrando" ? "plano_sobrando" : "retorno");
      setOcupado(null);
      if ("error" in r) toast.error(r.error);
      else toast.success(`Mensagem enviada para o tutor do ${l.petNome}.`);
    });
  }

  function pausar(l: Linha) {
    setOcupado(l.petId);
    startTransition(async () => {
      const r = await pausarRetornoPet(l.petId, !l.pausado);
      setOcupado(null);
      if ("error" in r) toast.error(r.error);
      else toast.success(l.pausado ? `${l.petNome} voltou pros avisos automáticos.` : `${l.petNome} não vai mais receber avisos automáticos.`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Oportunidades"
        description="Quem está na hora de voltar, quem sumiu e quando o BubblePet vai avisar cada um."
      />

      {/* Mensagens automáticas */}
      <div className="glass flex flex-col gap-4 rounded-card p-5 md:flex-row md:items-center">
        <div className="flex flex-1 items-start gap-4">
          <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", config.ativo ? "bg-brand" : "bg-muted text-muted-foreground")}>
            {config.ativo ? <BellRing size={22} /> : <BellOff size={22} />}
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-bold">
              Mensagens automáticas de retorno {config.ativo ? "ligadas" : "desligadas"}
            </p>
            <p className="text-sm text-muted-foreground">
              Envia entre {config.janela_inicio} e {config.janela_fim}, uma mensagem a cada {config.intervalo_envio_min} min,
              até {config.limite_dia} por dia. O mesmo pet só recebe de novo depois de {config.reenviar_apos_dias} dias.
            </p>
            {!whatsappConectado && (
              <p className="text-sm font-medium text-destructive">
                O WhatsApp está desconectado: nada sai até conectar em{" "}
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
            {config.ativo ? "Desligar" : "Ligar envio automático"}
          </Button>
        </div>
      </div>

      {/* Números */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Numero icon={Clock} titulo="Na hora de voltar" valor={String(naHora.length)} dica={soma(naHora) ? `${formatCentavos(soma(naHora))} em atendimentos possíveis` : "pelo ritmo de cada pet"} destaque />
        <Numero icon={PawPrint} titulo="Atrasados" valor={String(atrasados.length)} dica={soma(atrasados) ? `${formatCentavos(soma(atrasados))} esperando para voltar` : "passaram da data de voltar"} />
        <Numero icon={Wallet} titulo="Plano sobrando" valor={String(sobrando.length)} dica={`${sobrando.reduce((s, l) => s + (l.plano?.saldo ?? 0), 0)} banhos que se perdem na virada do mês`} />
        <Numero icon={TrendingUp} titulo="Voltaram com a mensagem" valor={String(voltaram.length)} dica={recuperado ? `${formatCentavos(recuperado)} nos últimos 30 dias` : "nos últimos 30 dias"} />
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-2">
        {ABAS.map((a) => {
          const n = porGrupo(a.grupo).length;
          return (
            <button
              key={a.grupo}
              type="button"
              onClick={() => setAba(a.grupo)}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                aba === a.grupo ? "bg-brand" : "glass text-muted-foreground hover:text-foreground"
              )}
            >
              {a.label}
              <span className={cn("rounded-full px-2 py-0.5 text-xs", aba === a.grupo ? "bg-white/25" : "bg-muted")}>{n}</span>
            </button>
          );
        })}
      </div>

      {lista.length === 0 ? (
        <EmptyState icon={PawPrint} title={ABAS.find((a) => a.grupo === aba)!.vazio} description="A lista se atualiza sozinha com a agenda." />
      ) : (
        <div className="glass flex flex-col divide-y divide-border/70 overflow-hidden rounded-card">
          {lista.map((l) => {
            const s = situacaoMensagem(l, config.ativo);
            return (
              <div key={`${l.grupo}-${l.petId}`} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-[15px] font-bold">
                    {l.petNome} <span className="font-medium text-muted-foreground">· {l.tutorNome}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {l.plano ? (
                      <>
                        <b className="text-foreground">{l.plano.saldo} de {l.plano.creditosMes}</b> banhos do {l.plano.nome} sobrando este mês
                      </>
                    ) : (
                      <>
                        {l.intervaloEstimado
                          ? `1 visita · sem ritmo ainda, usando ${l.intervaloDias} dias`
                          : `Vem a cada ~${l.intervaloDias} dias (${l.visitas} visitas)`}
                        {" · "}última em {data(l.ultimaVisita)} ({l.diasDesdeUltima} dias)
                        {l.grupo !== "agendado" && l.diasParaVoltar !== null && (
                          <>
                            {" · "}
                            {l.diasParaVoltar >= 0
                              ? `volta prevista ${data(l.proxima)}`
                              : `${Math.abs(l.diasParaVoltar)} dias de atraso`}
                          </>
                        )}
                      </>
                    )}
                  </p>
                  <span className={cn("self-start rounded-full px-2.5 py-1 text-xs font-semibold", TOM[s.tom])} title={l.mensagem?.erro ?? undefined}>
                    {s.texto}
                  </span>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {l.grupo !== "agendado" && (
                    <Button size="sm" onClick={() => enviar(l)} disabled={pendente || !whatsappConectado}>
                      <Send size={14} /> {ocupado === l.petId ? "Enviando..." : "Enviar agora"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/agenda" />}>
                    <CalendarPlus size={14} /> Agendar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pausar(l)} disabled={pendente} title="Não incomodar">
                    {l.pausado ? <BellRing size={14} /> : <BellOff size={14} />} {l.pausado ? "Retomar" : "Pausar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfigRetornoSheet open={configAberta} onOpenChange={setConfigAberta} config={config} />
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
