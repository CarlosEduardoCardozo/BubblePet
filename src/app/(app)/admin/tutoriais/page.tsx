import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAdminPagina } from "@/lib/admin-acesso";
import { TutoriaisAdminView, type TutorialAdmin } from "./TutoriaisAdminView";

export const metadata = { title: "Tutoriais · Admin · BubblePet" };

export default async function AdminTutoriaisPage() {
  await exigirAdminPagina();
  const { data } = await createAdminClient()
    .from("tutoriais")
    .select("id, topico, titulo, descricao, video_url, duracao, ordem, ativo")
    .order("ordem")
    .order("criado_em");

  const tutoriais: TutorialAdmin[] = (data ?? []).map((r) => ({
    id: r.id,
    topico: r.topico,
    titulo: r.titulo,
    descricao: r.descricao,
    videoUrl: r.video_url,
    duracao: r.duracao,
    ordem: r.ordem,
    ativo: r.ativo,
  }));

  return <TutoriaisAdminView tutoriais={tutoriais} />;
}
