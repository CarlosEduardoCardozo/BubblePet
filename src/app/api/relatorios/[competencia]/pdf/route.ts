import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { dadosRelatorio } from "@/lib/fechamento/relatorio";
import { renderRelatorioPdf } from "@/lib/pdf/documentos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ competencia: string }> }
) {
  const { competencia } = await params;
  if (!/^\d{4}-\d{2}-01$/.test(competencia) || !DateTime.fromISO(competencia).isValid) {
    return new Response("Competência inválida", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autorizado", { status: 401 });

  const petshopId = await getCurrentPetshopId(supabase);
  const { data: petshop } = await supabase.from("petshops").select("nome").eq("id", petshopId).single();
  if (!petshop) return new Response("Não encontrado", { status: 404 });

  const dados = await dadosRelatorio(supabase, petshopId, competencia);
  const pdf = await renderRelatorioPdf({ petshop: { nome: petshop.nome }, ...dados });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="relatorio-${competencia.slice(0, 7)}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
