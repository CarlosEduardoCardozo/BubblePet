"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CirclePlay, CircleQuestionMark, PlayCircle, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { playerDoVideo, tituloDoTopico, topicoDaRota, type Tutorial } from "@/lib/tutoriais";

const TutoriaisContext = createContext<Tutorial[]>([]);

/** Carregado uma vez no layout do painel; qualquer tela lê daqui. */
export function TutoriaisProvider({ tutoriais, children }: { tutoriais: Tutorial[]; children: React.ReactNode }) {
  return <TutoriaisContext.Provider value={tutoriais}>{children}</TutoriaisContext.Provider>;
}

export function useTodosTutoriais(): Tutorial[] {
  return useContext(TutoriaisContext);
}

export function useTutoriaisDoTopico(topico: string | null): Tutorial[] {
  const todos = useContext(TutoriaisContext);
  return useMemo(() => (topico ? todos.filter((t) => t.topico === topico) : []), [todos, topico]);
}

/** Player do vídeo, no tamanho 16:9. */
export function PlayerTutorial({ tutorial }: { tutorial: Tutorial }) {
  const player = playerDoVideo(tutorial.videoUrl);
  if (!player) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {player.tipo === "iframe" ? (
        <iframe
          key={player.src}
          src={player.src}
          title={tutorial.titulo}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <video key={player.src} src={player.src} controls autoPlay playsInline className="absolute inset-0 size-full" />
      )}
    </div>
  );
}

/**
 * Modal com o vídeo. Se o tópico tiver mais de um vídeo, a lista fica embaixo
 * pra trocar sem fechar.
 */
export function TutorialModal({
  tutoriais,
  inicial,
  open,
  onOpenChange,
}: {
  tutoriais: Tutorial[];
  inicial?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [atualId, setAtualId] = useState<string | undefined>(inicial);
  const atual = tutoriais.find((t) => t.id === (atualId ?? inicial)) ?? tutoriais[0];
  if (!atual) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setAtualId(undefined);
      }}
    >
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {/* Fechar sempre visível, mesmo sobre o vídeo escuro. */}
        <DialogClose
          aria-label="Fechar vídeo"
          className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md transition-colors hover:bg-white"
        >
          <X size={18} />
        </DialogClose>
        {/* O vídeo só monta com o modal aberto: fechou, parou de tocar. */}
        {open && <PlayerTutorial tutorial={atual} />}
        <div className="flex flex-col gap-1 p-5 pr-12">
          <p className="text-xs font-bold tracking-wide text-primary uppercase">{tituloDoTopico(atual.topico)}</p>
          <DialogTitle className="text-lg font-extrabold tracking-tight">{atual.titulo}</DialogTitle>
          {atual.descricao ? (
            <DialogDescription className="text-sm text-muted-foreground">{atual.descricao}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">Vídeo tutorial do BubblePet</DialogDescription>
          )}
        </div>
        {tutoriais.length > 1 && (
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto border-t border-border p-3">
            {tutoriais.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setAtualId(t.id)}
                  aria-current={t.id === atual.id ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
                    t.id === atual.id ? "bg-secondary text-secondary-foreground" : "hover:bg-muted"
                  )}
                >
                  <PlayCircle size={16} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                  {t.duracao && <span className="text-xs font-medium text-muted-foreground">{t.duracao}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ícone de dúvida ao lado do título da tela. Descobre o tópico pelo endereço
 * (ou recebe `topico`) e só aparece se houver vídeo cadastrado pra ele.
 */
export function AjudaVideo({ topico, className }: { topico?: string; className?: string }) {
  const pathname = usePathname();
  const chave = topico ?? topicoDaRota(pathname);
  const videos = useTutoriaisDoTopico(chave);
  const [aberto, setAberto] = useState(false);
  if (videos.length === 0) return null;

  const rotulo = videos.length === 1 ? `Ver tutorial: ${videos[0].titulo}` : `Ver ${videos.length} tutoriais desta tela`;
  return (
    <>
      {/* Discreto: só o "?" em cinza; no hover (ou foco pelo teclado) fica roxo
          e abre o rótulo "Ver tutorial". */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={rotulo}
        title={rotulo}
        className={cn(
          "group/ajuda inline-flex h-7 shrink-0 items-center rounded-full text-muted-foreground/70 transition-all duration-200 hover:bg-secondary hover:pr-2.5 hover:text-primary focus-visible:bg-secondary focus-visible:pr-2.5 focus-visible:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
          className
        )}
      >
        <span className="flex size-7 items-center justify-center">
          <CircleQuestionMark size={17} className="group-hover/ajuda:hidden group-focus-visible/ajuda:hidden" />
          <CirclePlay size={17} className="hidden group-hover/ajuda:block group-focus-visible/ajuda:block" />
        </span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold transition-all duration-200 group-hover/ajuda:max-w-24 group-focus-visible/ajuda:max-w-24">
          Ver tutorial
        </span>
      </button>
      <TutorialModal tutoriais={videos} open={aberto} onOpenChange={setAberto} />
    </>
  );
}
