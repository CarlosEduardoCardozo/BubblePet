import { createAdminClient } from "@/lib/supabase/admin";
import { getSessaoTutor } from "@/lib/publico/session";
import { petshopPorSlug } from "@/lib/publico/dal";
import { nomeArquivoExtrato, renderFechamentoPdf } from "@/lib/pdf/documentos";
import type { ItemFechamento } from "@/lib/fechamento/calcular";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

// Extrato do próprio tutor: a sessão do link público vale só para este petshop
// e este cliente; rascunho (não enviado) nunca sai.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const sessao = await getSessaoTutor(slug);
  const petshop = await petshopPorSlug(slug);
  if (!sessao || !petshop || sessao.petshopId !== petshop.id) return new Response("Não autorizado", { status: 401 });

  const admin = createAdminClient();
  const { data: f } = await admin
    .from("fechamentos")
    .select("id, competencia, itens, total_centavos, status, enviado_em, tutores(nome, telefone), petshops(nome, chave_pix, telefone, endereco)")
    .eq("id", id)
    .eq("petshop_id", petshop.id)
    .eq("tutor_id", sessao.tutorId)
    .maybeSingle();
  if (!f || (f.status !== "pago" && !f.enviado_em)) return new Response("Não encontrado", { status: 404 });

  const tutor = um(f.tutores as Um<{ nome: string; telefone: string }>);
  const dono = um(f.petshops as Um<{ nome: string; chave_pix: string | null; telefone: string | null; endereco: string | null }>);
  if (!tutor || !dono) return new Response("Não encontrado", { status: 404 });

  const pdf = await renderFechamentoPdf({
    petshop: dono,
    tutor,
    competencia: f.competencia,
    itens: f.itens as ItemFechamento[],
    totalCentavos: f.total_centavos,
    status: f.status as "aberto" | "pago",
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${nomeArquivoExtrato(f.competencia, tutor.nome)}"`,
      "cache-control": "private, no-store",
    },
  });
}
