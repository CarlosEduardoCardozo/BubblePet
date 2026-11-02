"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Image as ImageIcon, Loader2, Video, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BALDE_REGISTROS } from "@/lib/chegada";
import { prepararArquivo } from "@/lib/midia-cliente";
import { concluirEnvioCelular, iniciarEnvioCelular } from "./actions";

type Item = { id: number; nome: string; estado: "enviando" | "ok" | "erro"; erro?: string };

/** Tela do celular: tira ou escolhe fotos e vídeos e manda direto, sem entrar na conta. */
export function EnviarFlow({ token }: { token: string }) {
  const [itens, setItens] = useState<Item[]>([]);
  const proximo = useRef(1);
  const foto = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  function atualizar(id: number, parte: Partial<Item>) {
    setItens((lista) => lista.map((i) => (i.id === id ? { ...i, ...parte } : i)));
  }

  async function enviarUm(arquivo: File) {
    const id = proximo.current++;
    setItens((lista) => [{ id, nome: arquivo.name || "arquivo", estado: "enviando" }, ...lista]);
    try {
      const pronto = await prepararArquivo(arquivo);
      if (!pronto) return atualizar(id, { estado: "erro", erro: "Envie uma foto ou um vídeo." });

      const preparo = await iniciarEnvioCelular(token, {
        midia: pronto.midia,
        extensao: pronto.extensao,
        tamanhoBytes: pronto.blob.size,
      });
      if (!preparo.ok) return atualizar(id, { estado: "erro", erro: preparo.erro });

      const { error } = await createClient()
        .storage.from(BALDE_REGISTROS)
        .uploadToSignedUrl(preparo.caminho, preparo.tokenEnvio, pronto.blob, { contentType: pronto.tipo });
      if (error) return atualizar(id, { estado: "erro", erro: "O envio falhou. Confira o sinal e tente de novo." });

      const fim = await concluirEnvioCelular(token, { caminho: preparo.caminho, midia: pronto.midia, tamanhoBytes: pronto.blob.size });
      if (!fim.ok) return atualizar(id, { estado: "erro", erro: fim.erro });
      atualizar(id, { estado: "ok" });
    } catch {
      atualizar(id, { estado: "erro", erro: "Algo deu errado. Tente de novo." });
    }
  }

  async function escolher(arquivos: FileList | null, campo: React.RefObject<HTMLInputElement | null>) {
    if (!arquivos) return;
    const lista = Array.from(arquivos);
    if (campo.current) campo.current.value = "";
    // Um de cada vez: celular com sinal fraco não aguenta tudo junto.
    for (const arquivo of lista) await enviarUm(arquivo);
  }

  const enviados = itens.filter((i) => i.estado === "ok").length;
  const enviando = itens.some((i) => i.estado === "enviando");

  const botao =
    "flex h-16 w-full items-center gap-3 rounded-2xl border border-border bg-white px-5 text-left text-base font-semibold shadow-sm active:scale-[0.99]";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <button type="button" className={botao} onClick={() => foto.current?.click()}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Camera size={22} />
          </span>
          Tirar foto
        </button>
        <button type="button" className={botao} onClick={() => video.current?.click()}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Video size={22} />
          </span>
          Gravar vídeo
        </button>
        <button type="button" className={botao} onClick={() => galeria.current?.click()}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ImageIcon size={22} />
          </span>
          Escolher da galeria
        </button>
      </div>

      <input ref={foto} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => escolher(e.target.files, foto)} />
      <input ref={video} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => escolher(e.target.files, video)} />
      <input ref={galeria} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => escolher(e.target.files, galeria)} />

      {itens.length > 0 && (
        <section className="flex flex-col gap-2" aria-live="polite">
          <p className="text-sm font-medium">
            {enviando ? "Enviando..." : `${enviados} arquivo${enviados === 1 ? "" : "s"} enviado${enviados === 1 ? "" : "s"} ✔`}
          </p>
          <ul className="flex flex-col gap-1.5">
            {itens.map((i) => (
              <li key={i.id} className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
                {i.estado === "enviando" && <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-primary" />}
                {i.estado === "ok" && <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />}
                {i.estado === "erro" && <XCircle size={18} className="mt-0.5 shrink-0 text-destructive" />}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{i.nome}</span>
                  {i.erro && <span className="text-xs text-destructive">{i.erro}</span>}
                </span>
              </li>
            ))}
          </ul>
          {!enviando && enviados > 0 && (
            <p className="text-xs text-muted-foreground">Pode fechar esta tela: as fotos já aparecem no computador.</p>
          )}
        </section>
      )}
    </div>
  );
}
