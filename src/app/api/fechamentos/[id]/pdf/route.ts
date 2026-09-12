import { createClient } from "@/lib/supabase/server";
import { nomeArquivoExtrato, renderFechamentoPdf } from "@/lib/pdf/documentos";
import type { ItemFechamento } from "@/lib/fechamento/calcular";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

// Autentica sozinho: o proxy libera /api sem sessão. A RLS delimita o tenant.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autorizado", { status: 401 });

  const { data: f } = await supabase
    .from("fechamentos")
    .select(
      "id, competencia, itens, total_centavos, status, tutores(nome, telefone), petshops(nome, chave_pix, telefone, endereco)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!f) return new Response("Não encontrado", { status: 404 });

  const tutor = um(f.tutores as Um<{ nome: string; telefone: string }>);
  const petshop = um(
    f.petshops as Um<{ nome: string; chave_pix: string | null; telefone: string | null; endereco: string | null }>
  );
  if (!tutor || !petshop) return new Response("Não encontrado", { status: 404 });

  const pdf = await renderFechamentoPdf({
    petshop,
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
