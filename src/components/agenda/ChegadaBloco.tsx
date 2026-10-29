"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, ClipboardList, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BALDE_REGISTROS, CONDICOES_CHEGADA, LIMITE_MIDIA_BYTES } from "@/lib/chegada";
import {
  carregarChegada,
  registrarMidia,
  removerMidia,
  salvarChegada,
  type DadosChegada,
} from "@/app/(app)/agenda/chegada-actions";

/** Reduz a foto no aparelho (máx. 1600 px, JPEG). Se o navegador não abrir o formato, manda como está. */
async function prepararFoto(arquivo: File): Promise<{ blob: Blob; tipo: string; extensao: string }> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (blob) return { blob, tipo: "image/jpeg", extensao: "jpg" };
  } catch {
    /* segue com o arquivo original */
  }
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";
  return { blob: arquivo, tipo: arquivo.type || "image/jpeg", extensao };
}

/** Como o pet chegou: marcas rápidas, observação e fotos/vídeos do atendimento. */
export function ChegadaBloco({ agendamentoId }: { agendamentoId: string }) {
  const [dados, setDados] = useState<DadosChegada | null>(null);
  const [condicoes, setCondicoes] = useState<string[]>([]);
  const [observacao, setObservacao] = useState("");
  const [mostrarTutor, setMostrarTutor] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [enviando, setEnviando] = useState(0);
  const [isPending, startTransition] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  function aplicar(r: DadosChegada) {
    setDados(r);
    setCondicoes(r.condicoes);
    setObservacao(r.observacao);
    setMostrarTutor(r.mostrarTutor);
    setAlterado(false);
  }

  useEffect(() => {
    let cancelado = false;
    carregarChegada(agendamentoId).then((r) => {
      if (!cancelado && !("error" in r)) aplicar(r);
    });
    return () => {
      cancelado = true;
    };
  }, [agendamentoId]);

  async function recarregarMidias() {
    const r = await carregarChegada(agendamentoId);
    if (!("error" in r)) setDados((atual) => (atual ? { ...atual, midias: r.midias } : r));
  }

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
      }
    });
  }

  async function enviar(arquivos: FileList | null) {
    if (!arquivos || !dados) return;
    const supabase = createClient();
    for (const arquivo of Array.from(arquivos)) {
      const video = arquivo.type.startsWith("video/");
      if (!video && !arquivo.type.startsWith("image/")) {
        toast.error(`${arquivo.name}: envie uma foto ou um vídeo.`);
        continue;
      }
      setEnviando((n) => n + 1);
      try {
        const pronto = video
          ? { blob: arquivo as Blob, tipo: arquivo.type, extensao: arquivo.name.split(".").pop()?.toLowerCase() || "mp4" }
          : await prepararFoto(arquivo);
        if (pronto.blob.size > LIMITE_MIDIA_BYTES) {
          toast.error("O vídeo passa de 50 MB. Grave um trecho mais curto.");
          continue;
        }
        const caminho = `${dados.petshopId}/${agendamentoId}/${crypto.randomUUID()}.${pronto.extensao}`;
        const { error } = await supabase.storage.from(BALDE_REGISTROS).upload(caminho, pronto.blob, { contentType: pronto.tipo });
        if (error) {
          toast.error("Não foi possível enviar o arquivo. Tente de novo.");
          continue;
        }
        const r = await registrarMidia(agendamentoId, {
          caminho,
          tipo: video ? "video" : "foto",
          tamanhoBytes: pronto.blob.size,
        });
        if ("error" in r) {
          await supabase.storage.from(BALDE_REGISTROS).remove([caminho]);
          toast.error(r.error);
        }
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    await recarregarMidias();
    if (entrada.current) entrada.current.value = "";
  }

  function apagar(id: string) {
    startTransition(async () => {
      const r = await removerMidia(id);
      if ("error" in r) toast.error(r.error);
      else await recarregarMidias();
    });
  }

  if (!dados) return null;
  const temRegistro = condicoes.length > 0 || observacao.trim() !== "" || dados.midias.length > 0;

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
        {dados.midias.map((m) => (
          <div key={m.id} className="group relative size-20 overflow-hidden rounded-lg border border-border bg-muted">
            {m.tipo === "foto" ? (
              <a href={m.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="Foto da chegada" className="size-full object-cover" />
              </a>
            ) : (
              <video src={m.url} controls preload="metadata" className="size-full object-cover" />
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
          <Camera size={18} /> Foto ou vídeo
        </button>
        <input
          ref={entrada}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => enviar(e.target.files)}
        />
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
    </div>
  );
}
