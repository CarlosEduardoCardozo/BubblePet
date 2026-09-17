"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Hash, MessageCircle, QrCode, RefreshCw, Send, Unplug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatPhoneBR } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  conectarWhatsapp,
  desconectarWhatsapp,
  enviarMensagemTeste,
  verificarWhatsapp,
  type EstadoConexao,
} from "./actions";

export type MensagemLog = {
  id: string;
  numero: string;
  tipo: string;
  status: "enviada" | "erro";
  erro: string | null;
  criado_em: string;
};

const TIPO_LABEL: Record<string, string> = {
  teste: "Teste",
  lembrete: "Lembrete",
  confirmacao: "Confirmação",
  otp: "Código",
  fechamento: "Fechamento",
  relatorio: "Relatório",
};

const POLL_MS = 3000;
const POLL_MAX = 40; // ~2 min: depois disso o QR já expirou
const POLL_MAX_CODIGO = 100; // ~5 min: validade do código de pareamento

type Fase =
  | { tipo: "idle" }
  | { tipo: "pedirNumero" }
  | { tipo: "qr"; qrcode: string | null; polls: number }
  | { tipo: "codigo"; paircode: string; polls: number }
  | { tipo: "expirado"; porCodigo: boolean };

/** "ABCD1234" -> "ABCD-1234", como o WhatsApp mostra. */
function formatarCodigo(codigo: string): string {
  const limpo = codigo.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return limpo.length === 8 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : codigo.toUpperCase();
}

export function WhatsappCard({
  status,
  numero,
  profileNome,
  telefonePetshop,
  mensagens,
}: {
  status: string;
  numero: string | null;
  profileNome: string | null;
  telefonePetshop: string | null;
  mensagens: MensagemLog[];
}) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>({ tipo: "idle" });
  const [erro, setErro] = useState<string | null>(null);
  const [confirmDesconectar, setConfirmDesconectar] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [telefone, setTelefone] = useState(telefonePetshop ? formatPhoneBR(telefonePetshop) : "");

  const conectado = status === "conectado";

  function aplicarEstado(estado: EstadoConexao) {
    if ("error" in estado) {
      setErro(estado.error);
      setFase({ tipo: "idle" });
      return;
    }
    if (estado.status === "conectado") {
      setFase({ tipo: "idle" });
      toast.success(
        estado.profileNome
          ? `WhatsApp conectado como ${estado.profileNome}.`
          : "WhatsApp conectado."
      );
      router.refresh();
      return;
    }
    if (estado.status === "conectando") {
      setFase((atual) => {
        // Código de pareamento: mantém o código na tela até conectar ou vencer.
        if (estado.paircode || atual.tipo === "codigo") {
          const polls = atual.tipo === "codigo" && !estado.paircode ? atual.polls + 1 : 0;
          if (polls >= POLL_MAX_CODIGO) return { tipo: "expirado", porCodigo: true };
          return {
            tipo: "codigo",
            paircode: estado.paircode ?? (atual.tipo === "codigo" ? atual.paircode : ""),
            polls,
          };
        }
        const polls = atual.tipo === "qr" ? atual.polls + 1 : 0;
        // ~2 min sem leitura: o QR já expirou do lado do WhatsApp.
        if (polls >= POLL_MAX) return { tipo: "expirado", porCodigo: false };
        return {
          tipo: "qr",
          qrcode: estado.qrcode ?? (atual.tipo === "qr" ? atual.qrcode : null),
          polls,
        };
      });
      return;
    }
    setFase({ tipo: "idle" });
  }

  function conectar() {
    setErro(null);
    startTransition(async () => {
      aplicarEstado(await conectarWhatsapp());
    });
  }

  function conectarPorCodigo(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    startTransition(async () => {
      const estado = await conectarWhatsapp({ telefone });
      if ("error" in estado) {
        // Erro de número: continua no formulário pra corrigir.
        setErro(estado.error);
        return;
      }
      aplicarEstado(estado);
    });
  }

  // Enquanto o QR ou o código está na tela, pergunta pra UAZAPI a cada 3s se
  // o celular já conectou. Para sozinho ao conectar, ao dar erro ou ao vencer.
  useEffect(() => {
    if (fase.tipo !== "qr" && fase.tipo !== "codigo") return;
    const timer = setTimeout(async () => {
      aplicarEstado(await verificarWhatsapp());
    }, POLL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o número de polls importa
  }, [fase]);

  function desconectar() {
    startTransition(async () => {
      const result = await desconectarWhatsapp();
      setConfirmDesconectar(false);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("WhatsApp desconectado.");
        router.refresh();
      }
    });
  }

  function enviarTeste() {
    startTransition(async () => {
      const result = await enviarMensagemTeste();
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Mensagem de teste enviada.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle size={18} className="text-primary" />
              WhatsApp
            </CardTitle>
            <CardDescription>
              Lembretes, confirmações, códigos de acesso e o extrato do mês saem
              pelo número do petshop.
            </CardDescription>
          </div>
          <Badge
            variant={conectado ? "default" : "secondary"}
            className={cn(conectado && "bg-success text-success-foreground")}
          >
            <span
              className={cn(
                "mr-1 inline-block size-1.5 rounded-full",
                conectado ? "bg-white" : "bg-muted-foreground"
              )}
            />
            {conectado ? "Conectado" : status === "conectando" ? "Aguardando" : "Desconectado"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {conectado ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-[12px] border border-border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">{profileNome ?? "Perfil do WhatsApp"}</div>
              <div className="text-muted-foreground">
                {numero ? formatPhoneBR(numero) : "número não informado"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={enviarTeste}
                disabled={isPending || !telefonePetshop}
                title={!telefonePetshop ? "Cadastre o telefone do petshop primeiro" : undefined}
              >
                <Send size={14} />
                Enviar mensagem de teste
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmDesconectar(true)}
                disabled={isPending}
              >
                <Unplug size={14} />
                Desconectar
              </Button>
            </div>
          </div>
        ) : fase.tipo === "qr" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            {fase.qrcode ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL vinda da UAZAPI
              <img
                src={fase.qrcode}
                alt="QR code para conectar o WhatsApp"
                width={220}
                height={220}
                className="rounded-[12px] border border-border"
              />
            ) : (
              <div className="flex size-[220px] items-center justify-center rounded-[12px] border border-dashed border-border text-sm text-muted-foreground">
                Gerando QR code...
              </div>
            )}
            <ol className="text-left text-xs text-muted-foreground">
              <li>1. Abra o WhatsApp no celular do petshop</li>
              <li>2. Toque em ⋮ › <strong>Aparelhos conectados</strong></li>
              <li>3. <strong>Conectar aparelho</strong> e aponte pro QR</li>
            </ol>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw size={12} className="animate-spin" />
              Aguardando leitura...
            </p>
          </div>
        ) : fase.tipo === "codigo" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Código de conexão
            </span>
            <span className="select-all rounded-[12px] border border-border bg-muted/30 px-5 py-3 font-mono text-3xl font-semibold tracking-[0.2em]">
              {formatarCodigo(fase.paircode)}
            </span>
            <ol className="text-left text-xs text-muted-foreground">
              <li>1. Abra o WhatsApp no celular do petshop</li>
              <li>2. Toque em ⋮ (ou Configurações) › <strong>Aparelhos conectados</strong></li>
              <li>3. <strong>Conectar aparelho</strong></li>
              <li>4. Toque em <strong>Conectar com número de telefone</strong> e digite o código</li>
            </ol>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw size={12} className="animate-spin" />
              Aguardando o código ser digitado... (vale 5 minutos)
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFase({ tipo: "idle" })}>
              Voltar
            </Button>
          </div>
        ) : fase.tipo === "pedirNumero" ? (
          <form onSubmit={conectarPorCodigo} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wpp-numero">Número do WhatsApp que vai ser conectado</Label>
              <Input
                id="wpp-numero"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                inputMode="tel"
                placeholder="(47) 99999-9999"
                autoFocus
              />
              <span className="text-xs text-muted-foreground">
                O WhatsApp gera um código de 8 letras/números pra digitar nesse celular.
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setFase({ tipo: "idle" })} disabled={isPending}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1" disabled={isPending || !telefone.trim()}>
                {isPending ? "Gerando código..." : "Gerar código"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            {fase.tipo === "expirado" && (
              <p className="text-sm text-muted-foreground">
                {fase.porCodigo
                  ? "O código venceu. Gere outro para tentar de novo."
                  : "O QR code expirou. Gere um novo para tentar de novo."}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" onClick={conectar} disabled={isPending}>
                <QrCode size={16} />
                {isPending ? "Gerando QR code..." : "Conectar com QR code"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setErro(null);
                  setFase({ tipo: "pedirNumero" });
                }}
                disabled={isPending}
              >
                <Hash size={16} />
                Conectar com código
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A câmera não leu o QR? Use o código: é só digitar no celular.
            </p>
          </div>
        )}

        {erro && (
          <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        {mensagens.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Últimas mensagens</span>
            <ul className="flex flex-col divide-y divide-border rounded-[12px] border border-border text-xs">
              {mensagens.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {TIPO_LABEL[m.tipo] ?? m.tipo} · {formatPhoneBR(m.numero)}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {DateTime.fromISO(m.criado_em)
                        .setZone("America/Sao_Paulo")
                        .setLocale("pt-BR")
                        .toFormat("dd/LL HH:mm")}
                      {m.erro ? ` — ${m.erro}` : ""}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 font-medium",
                      m.status === "enviada"
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {m.status === "enviada" ? "Enviada" : "Erro"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmDesconectar}
        onOpenChange={setConfirmDesconectar}
        title="Desconectar o WhatsApp?"
        description="Os tutores deixam de receber lembretes e o link de agendamento fica indisponível até reconectar."
        confirmLabel="Desconectar"
        pending={isPending}
        onConfirm={desconectar}
      />
    </Card>
  );
}
