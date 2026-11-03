"use client";

import { useState } from "react";
import { Clapperboard, Play } from "lucide-react";
import { playerDoVideo, TOPICOS, type Tutorial } from "@/lib/tutoriais";
import { TutorialModal, useTodosTutoriais } from "./Tutoriais";

function Miniatura({ tutorial }: { tutorial: Tutorial }) {
  const [falhou, setFalhou] = useState(false);
  const miniatura = falhou ? null : (playerDoVideo(tutorial.videoUrl)?.miniatura ?? null);
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-brand">
      {miniatura ? (
        // Miniatura externa do YouTube: <img> simples, sem otimização do Next.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={miniatura} alt="" loading="lazy" onError={() => setFalhou(true)} className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" />
      ) : (
        <div aria-hidden className="absolute -top-8 -right-8 size-32 rounded-full bg-[#ffd34d]/40 blur-2xl" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-primary shadow-lg transition-transform group-hover:scale-110">
          <Play size={20} className="ml-0.5 fill-current" />
        </span>
      </span>
      {tutorial.duracao && (
        <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
          {tutorial.duracao}
        </span>
      )}
    </div>
  );
}

export function GaleriaTutoriais() {
  const todos = useTodosTutoriais();
  const [aberto, setAberto] = useState<{ topico: string; id: string } | null>(null);

  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card glass px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Clapperboard size={26} />
        </span>
        <p className="text-lg font-bold">Os vídeos estão chegando</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Em breve você vai encontrar aqui um vídeo curto pra cada parte do BubblePet.
        </p>
      </div>
    );
  }

  const grupos = TOPICOS.map((t) => ({ ...t, videos: todos.filter((v) => v.topico === t.chave) })).filter(
    (g) => g.videos.length > 0
  );
  const videosAbertos = aberto ? todos.filter((v) => v.topico === aberto.topico) : [];

  return (
    <>
      <div className="flex flex-col gap-10">
        {grupos.map((g) => (
          <section key={g.chave} aria-labelledby={`tut-${g.chave}`} className="flex flex-col gap-4">
            <h2 id={`tut-${g.chave}`} className="text-xl font-extrabold tracking-tight">
              {g.titulo}
            </h2>
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {g.videos.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setAberto({ topico: g.chave, id: v.id })}
                    className="group flex w-full flex-col gap-3 rounded-[24px] glass p-3 text-left transition-shadow hover:shadow-[0_20px_40px_-20px_rgb(76_29_149/0.35)]"
                  >
                    <Miniatura tutorial={v} />
                    <div className="px-1 pb-1">
                      <p className="font-bold leading-snug">{v.titulo}</p>
                      {v.descricao && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{v.descricao}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {aberto && (
        <TutorialModal
          key={aberto.id}
          tutoriais={videosAbertos}
          inicial={aberto.id}
          open
          onOpenChange={(v) => !v && setAberto(null)}
        />
      )}
    </>
  );
}
