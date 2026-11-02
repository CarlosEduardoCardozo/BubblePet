"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, ClipboardList, Loader2, QrCode, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BALDE_REGISTROS, CONDICOES_CHEGADA, LIMITE_MIDIA_BYTES } from "@/lib/chegada";
import { prepararArquivo } from "@/lib/midia-cliente";
import { gerarEnvioCelular, registrarMidia, removerMidia, salvarChegada } from "@/app/(app)/agenda/chegada-actions";

export type MidiaChegada = { id: string; caminho: string; tipo: "foto" | "video" };
export type ChegadaInicial = { condicoes: string[]; observacao: string; mostrarTutor: boolean; midias: MidiaChegada[] };

/** Como o pet chegou: marcas rápidas, observação e fotos/vídeos. Os dados já chegam com a agenda. */
export function ChegadaBloco({
  agendamentoId,
  petshopId,
  inicial,
  onAtualizado,
}: {
  agendamentoId: string;
  petshopId: string;
  inicial: ChegadaInicial;
  onAtualizado: () => void;
}) {
  const [condicoes, setCondicoes] = useState<string[]>(inicial.condicoes);
  const [observacao, setObservacao] = useState(inicial.observacao);
  const [mostrarTutor, setMostrarTutor] = useState(inicial.mostrarTutor);
  const [alterado, setAlterado] = useState(false);
  const [midias, setMidias] = useState<MidiaChegada[]>(inicial.midias);
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Arquivos que o armazenamento não devolveu (apagados): mostram aviso em vez de girar para sempre.
  const [indisponiveis, setIndisponiveis] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(0);
  const [qr, setQr] = useState<{ url: string; qrSvg: string; validadeMin: number } | null>(null);
  const [qrAberto, setQrAberto] = useState(false);
  const [recebidos, setRecebidos] = useState(0);
  const [isPending, startTransition] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  // Endereços temporários das fotos, pedidos direto do navegador (uma ida só).
  // Cada arquivo é pedido uma vez só: se o arquivo não existir mais, não fica
  // pedindo de novo para sempre (já houve ciclo de pedidos por isso).
  const pedidos = useRef(new Set<string>());
  useEffect(() => {
    const faltando = midias.filter((m) => !pedidos.current.has(m.caminho));
    if (faltando.length === 0) return;
    for (const m of faltando) pedidos.current.add(m.caminho);
    createClient()
      .storage.from(BALDE_REGISTROS)
      .createSignedUrls(faltando.map((m) => m.caminho), 3600)
      .then(({ data }) => {
        setUrls((atual) => {
          const novo = { ...atual };
          for (const d of data ?? []) {
            if (d.path && d.signedUrl) {
              novo[d.path] = d.signedUrl;
            }
          }
          return novo;
        });
        setIndisponiveis((atual) => [...atual, ...faltando.map((m) => m.caminho).filter((c) => !(data ?? []).some((d) => d.path === c && d.signedUrl))]);
      });
  }, [midias]);

  const recarregarMidias = useCallback(async () => {
    const { data } = await createClient()
      .from("agendamento_midias")
      .select("id, caminho, tipo")
      .eq("agendamento_id", agendamentoId)
      .order("criado_em");
    if (data) setMidias(data as MidiaChegada[]);
    return data?.length ?? 0;
  }, [agendamentoId]);

  // Com o QR code aberto, confere de tempos em tempos o que chegou do celular.
  const baseRecebidos = useRef(inicial.midias.length);
  useEffect(() => {
    if (!qrAberto) return;
    baseRecebidos.current = midias.length;
    const id = setInterval(async () => {
      const total = await recarregarMidias();
      setRecebidos(Math.max(0, total - baseRecebidos.current));
    }, 4000);
    return () => clearInterval(id);
    // midias.length só vale na abertura; o intervalo recalcula sozinho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrAberto, recarregarMidias]);

  function alternar(valor: string) {
    setCondicoes((c) => (c.includes(valor) ? c.filter((x) => x !== valor) : [...c, valor]));
    setAlterado(true);
  }

  function salvar() {
    startTransition(async () => {
      const r = await salvarChegada(agendamentoId, { condicoes, observacao, mostrarTutor });
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Registro de chegada salvo.");
        setAlterado(false);
        onAtualizado();
      }
    });
  }

  async function enviar(arquivos: FileList | null) {
    if (!arquivos) return;
    const supabase = createClient();
    for (const arquivo of Array.from(arquivos)) {
      setEnviando((n) => n + 1);
      try {
        const pronto = await prepararArquivo(arquivo);
        if (!pronto) {
          toast.error(`${arquivo.name}: envie uma foto ou um vídeo.`);
          continue;
        }
        if (pronto.blob.size > LIMITE_MIDIA_BYTES) {
          toast.error("O vídeo passa de 50 MB. Grave um trecho mais curto.");
          continue;
        }
        const caminho = `${petshopId}/${agendamentoId}/${crypto.randomUUID()}.${pronto.extensao}`;
        const { error } = await supabase.storage.from(BALDE_REGISTROS).upload(caminho, pronto.blob, { contentType: pronto.tipo });
        if (error) {
          toast.error("Não foi possível enviar o arquivo. Tente de novo.");
          continue;
        }
        const r = await registrarMidia(agendamentoId, { caminho, tipo: pronto.midia, tamanhoBytes: pronto.blob.size });
        if ("error" in r) {
          await supabase.storage.from(BALDE_REGISTROS).remove([caminho]);
          toast.error(r.error);
        }
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    await recarregarMidias();
    onAtualizado();
    if (entrada.current) entrada.current.value = "";
  }

  function apagar(id: string) {
    startTransition(async () => {
      const r = await removerMidia(id);
      if ("error" in r) toast.error(r.error);
      else {
        await recarregarMidias();
        onAtualizado();
      }
    });
  }

  function abrirQr() {
    setQrAberto(true);
    setRecebidos(0);
    startTransition(async () => {
      const r = await gerarEnvioCelular(agendamentoId);
      if ("error" in r) {
        toast.error(r.error);
        setQrAberto(false);
        return;
      }
      setQr(r);
    });
  }

  const temRegistro = condicoes.length > 0 || observacao.trim() !== "" || midias.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <ClipboardList size={15} className="text-primary" /> Como o pet chegou
        </span>
        {!temRegistro && <span className="text-xs text-muted-foreground">nada registrado</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CONDICOES_CHEGADA.map((c) => {
          const ativo = condicoes.includes(c.valor);
          return (
            <button
              key={c.valor}
              type="button"
              onClick={() => alternar(c.valor)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                ativo ? "border-primary bg-primary text-white" : "border-border bg-white/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <Textarea
        value={observacao}
        onChange={(e) => {
          setObservacao(e.target.value);
          setAlterado(true);
        }}
        maxLength={500}
        rows={2}
        placeholder="Anote o que viu (onde é o machucado, quantos nós...)"
      />

      <div className="flex flex-wrap gap-2">
        {midias.map((m) => (
          <div key={m.id} className="group relative size-20 overflow-hidden rounded-lg border border-border bg-muted">
            {urls[m.caminho] ? (
              m.tipo === "foto" ? (
                <a href={urls[m.caminho]} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[m.caminho]} alt="Foto da chegada" className="size-full object-cover" />
                </a>
              ) : (
                <video src={urls[m.caminho]} controls preload="metadata" className="size-full object-cover" />
              )
            ) : indisponiveis.includes(m.caminho) ? (
              <span className="flex size-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
                Arquivo indisponível
              </span>
            ) : (
              <span className="flex size-full items-center justify-center text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
              </span>
            )}
            <button
              type="button"
              aria-label="Apagar arquivo"
              onClick={() => apagar(m.id)}
              disabled={isPending}
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {enviando > 0 && (
          <div className="flex size-20 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-primary/50 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          <Camera size={18} /> Deste aparelho
        </button>
        <button
          type="button"
          onClick={abrirQr}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-primary/50 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          <QrCode size={18} /> Pelo celular
        </button>
        <input ref={entrada} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
      </div>

      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={mostrarTutor}
          onCheckedChange={(v) => {
            setMostrarTutor(v === true);
            setAlterado(true);
          }}
        />
        <span className="text-xs text-muted-foreground">O tutor pode ver este registro na área dele</span>
      </Label>

      {alterado && (
        <Button size="sm" onClick={salvar} disabled={isPending} className="self-end">
          {isPending ? "Salvando..." : "Salvar registro"}
        </Button>
      )}

      <Dialog open={qrAberto} onOpenChange={setQrAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone size={18} /> Enviar pelo celular
            </DialogTitle>
            <DialogDescription>
              Aponte a câmera do celular para o QR code. Lá você tira foto, grava vídeo ou escolhe da galeria, sem precisar entrar na conta.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {qr ? (
              <div
                className="rounded-2xl border border-border bg-white p-2 [&>svg]:size-56"
                // O SVG é gerado pelo nosso servidor a partir do link, nunca de texto digitado.
                dangerouslySetInnerHTML={{ __html: qr.qrSvg }}
                aria-label="QR code para enviar fotos pelo celular"
                role="img"
              />
            ) : (
              <div className="flex size-60 items-center justify-center rounded-2xl border border-border bg-white">
                <Loader2 className="animate-spin text-muted-foreground" />
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {qr ? `Vale por ${qr.validadeMin} minutos e só serve para este atendimento.` : "Gerando o QR code..."}
            </p>
            <p className={cn("rounded-full px-3 py-1 text-xs font-semibold", recebidos > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
              {recebidos > 0 ? `${recebidos} arquivo${recebidos === 1 ? "" : "s"} recebido${recebidos === 1 ? "" : "s"}` : "Aguardando o envio..."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={abrirQr} disabled={isPending}>
                Gerar outro
              </Button>
              <Button size="sm" onClick={() => setQrAberto(false)}>
                Pronto
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
