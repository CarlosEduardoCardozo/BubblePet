"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Plus, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormSelect } from "@/components/shared/FormSelect";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PlayerTutorial } from "@/components/tutoriais/Tutoriais";
import { playerDoVideo, TOPICOS, tituloDoTopico } from "@/lib/tutoriais";
import { cn } from "@/lib/utils";
import { alternarTutorial, excluirTutorial, salvarTutorial, type TutorialForm } from "./actions";

export type TutorialAdmin = {
  id: string;
  topico: string;
  titulo: string;
  descricao: string | null;
  videoUrl: string;
  duracao: string | null;
  ordem: number;
  ativo: boolean;
};

const VAZIO: TutorialForm = { topico: "", titulo: "", descricao: "", videoUrl: "", duracao: "", ordem: 0 };

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm font-medium">
      {rotulo}
      {children}
      {dica && <span className="text-xs font-normal text-muted-foreground">{dica}</span>}
    </div>
  );
}

function Formulario({
  editando,
  onFim,
}: {
  editando: TutorialAdmin | null;
  onFim: () => void;
}) {
  const [form, setForm] = useState<TutorialForm>(
    editando
      ? {
          topico: editando.topico,
          titulo: editando.titulo,
          descricao: editando.descricao ?? "",
          videoUrl: editando.videoUrl,
          duracao: editando.duracao ?? "",
          ordem: editando.ordem,
        }
      : VAZIO
  );
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof TutorialForm>(k: K, v: TutorialForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const linkOk = !!playerDoVideo(form.videoUrl);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await salvarTutorial(editando?.id ?? null, form);
      if ("error" in r) return void toast.error(r.error);
      toast.success(editando ? "Vídeo atualizado." : "Vídeo adicionado.");
      onFim();
    });
  }

  return (
    <form onSubmit={salvar} className="glass grid gap-5 rounded-card p-5 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold">{editando ? "Editar vídeo" : "Novo vídeo"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Funcionalidade" dica="Onde aparece o ícone “Como usar”.">
            <FormSelect
              value={form.topico}
              onValueChange={(v) => set("topico", v)}
              options={TOPICOS.map((t) => ({
                value: t.chave,
                label: t.titulo,
                hint: t.rotas.length ? t.rotas.join(", ") : "Só na página Tutoriais",
              }))}
              placeholder="Escolha..."
            />
          </Campo>
          <Campo rotulo="Título">
            <Input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} maxLength={120} placeholder="Como marcar um banho" />
          </Campo>
        </div>
        <Campo rotulo="Link do vídeo" dica="YouTube (pode ser “não listado”), Vimeo, Loom, Google Drive ou arquivo .mp4.">
          <Input
            value={form.videoUrl}
            onChange={(e) => set("videoUrl", e.target.value)}
            maxLength={500}
            placeholder="https://youtu.be/..."
            aria-invalid={form.videoUrl.length > 8 && !linkOk ? true : undefined}
          />
        </Campo>
        <Campo rotulo="Descrição (opcional)">
          <textarea
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            maxLength={400}
            rows={2}
            className="w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Campo>
        <div className="grid grid-cols-2 gap-4 sm:max-w-xs">
          <Campo rotulo="Duração" dica="Ex.: 2:35">
            <Input value={form.duracao} onChange={(e) => set("duracao", e.target.value)} maxLength={10} placeholder="2:35" />
          </Campo>
          <Campo rotulo="Ordem" dica="Menor aparece antes.">
            <Input
              type="number"
              min={0}
              max={999}
              value={form.ordem}
              onChange={(e) => set("ordem", Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
            />
          </Campo>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : editando ? "Salvar" : "Adicionar vídeo"}
          </Button>
          <Button type="button" variant="ghost" onClick={onFim} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Prévia</span>
        <div className="overflow-hidden rounded-2xl">
          {linkOk ? (
            <PlayerTutorial
              tutorial={{ id: "previa", topico: form.topico, titulo: form.titulo || "Prévia", descricao: null, videoUrl: form.videoUrl, duracao: null, ordem: 0 }}
            />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted text-center text-xs text-muted-foreground">
              <Video size={22} />
              {form.videoUrl ? "Link não reconhecido" : "Cole o link pra ver a prévia"}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

export function TutoriaisAdminView({ tutoriais }: { tutoriais: TutorialAdmin[] }) {
  const [form, setForm] = useState<{ editando: TutorialAdmin | null } | null>(null);
  const [excluir, setExcluir] = useState<TutorialAdmin | null>(null);
  const [pending, startTransition] = useTransition();

  const grupos = TOPICOS.map((t) => ({ ...t, videos: tutoriais.filter((v) => v.topico === t.chave) }));
  const comVideo = grupos.filter((g) => g.videos.some((v) => v.ativo)).length;

  function alternar(t: TutorialAdmin) {
    startTransition(async () => {
      const r = await alternarTutorial(t.id, !t.ativo);
      if ("error" in r) toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tutoriais"
        description={`Vídeos de “como usar” do painel. ${comVideo} de ${TOPICOS.length} funcionalidades já têm vídeo.`}
        action={
          !form && (
            <Button onClick={() => setForm({ editando: null })}>
              <Plus /> Novo vídeo
            </Button>
          )
        }
      />

      {form && <Formulario key={form.editando?.id ?? "novo"} editando={form.editando} onFim={() => setForm(null)} />}

      <ul className="flex flex-col gap-2">
        {grupos.map((g) => (
          <li key={g.chave} className="glass rounded-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{g.titulo}</p>
              <span className="text-xs text-muted-foreground">{g.rotas.length ? g.rotas.join(", ") : "só na página Tutoriais"}</span>
              {g.videos.length === 0 && <Badge variant="outline" className="ml-auto">Sem vídeo</Badge>}
            </div>
            {g.videos.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {g.videos.map((v) => (
                  <li
                    key={v.id}
                    className={cn("flex flex-wrap items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm", !v.ativo && "opacity-60")}
                  >
                    <Video size={15} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {v.titulo}
                      {v.duracao && <span className="ml-2 text-xs text-muted-foreground">{v.duracao}</span>}
                    </span>
                    {!v.ativo && <Badge variant="secondary">Escondido</Badge>}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={v.ativo ? `Esconder ${v.titulo}` : `Mostrar ${v.titulo}`}
                      title={v.ativo ? "Esconder do painel" : "Mostrar no painel"}
                      onClick={() => alternar(v)}
                      disabled={pending}
                    >
                      {v.ativo ? <EyeOff /> : <Eye />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar ${v.titulo}`} onClick={() => setForm({ editando: v })}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir ${v.titulo}`}
                      onClick={() => setExcluir(v)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!excluir}
        onOpenChange={(v) => !v && setExcluir(null)}
        title="Excluir vídeo?"
        description={excluir ? `“${excluir.titulo}” sai do painel de todos os petshops. (${tituloDoTopico(excluir.topico)})` : ""}
        pending={pending}
        onConfirm={() =>
          excluir &&
          startTransition(async () => {
            const r = await excluirTutorial(excluir.id);
            if ("error" in r) toast.error(r.error);
            else setExcluir(null);
          })
        }
      />
    </div>
  );
}
