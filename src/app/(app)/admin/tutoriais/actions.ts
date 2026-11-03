"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAdminAcao } from "@/lib/admin-acesso";
import { CHAVES_TOPICO, playerDoVideo } from "@/lib/tutoriais";

type Resultado = { error: string } | { success: true };

const schema = z.object({
  topico: z.string().refine((t) => CHAVES_TOPICO.includes(t), "Escolha a funcionalidade."),
  titulo: z.string().trim().min(2, "Dê um título ao vídeo.").max(120),
  descricao: z.string().trim().max(400),
  videoUrl: z.string().trim().min(8, "Cole o link do vídeo.").max(500),
  duracao: z
    .string()
    .trim()
    .max(10)
    .refine((d) => !d || /^\d{1,2}:\d{2}$/.test(d), "Duração no formato 2:35."),
  ordem: z.number().int().min(0).max(999),
});
export type TutorialForm = z.input<typeof schema>;

function revalidar() {
  // O layout do painel carrega os vídeos: todas as telas precisam ver a mudança.
  revalidatePath("/", "layout");
}

export async function salvarTutorial(id: string | null, form: TutorialForm): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const p = schema.safeParse(form);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  if (!playerDoVideo(d.videoUrl)) {
    return { error: "Link não reconhecido. Use YouTube, Vimeo, Loom, Google Drive ou um arquivo .mp4 (https)." };
  }

  const campos = {
    topico: d.topico,
    titulo: d.titulo,
    descricao: d.descricao || null,
    video_url: d.videoUrl,
    duracao: d.duracao || null,
    ordem: d.ordem,
    atualizado_em: new Date().toISOString(),
  };
  const db = createAdminClient();
  const { error } = id ? await db.from("tutoriais").update(campos).eq("id", id) : await db.from("tutoriais").insert(campos);
  if (error) return { error: "Não foi possível salvar. Tente de novo." };
  revalidar();
  return { success: true };
}

export async function alternarTutorial(id: string, ativo: boolean): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const { error } = await createAdminClient()
    .from("tutoriais")
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Não foi possível alterar." };
  revalidar();
  return { success: true };
}

export async function excluirTutorial(id: string): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const { error } = await createAdminClient().from("tutoriais").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidar();
  return { success: true };
}
