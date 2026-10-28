import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { executarRotinaRetorno } from "@/lib/retorno/enviar";
import { executarAvisosFidelidade } from "@/lib/fidelidade-avisos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Chamado a cada 5 minutos pelo pg_cron do banco (função
 * chamar_rotina_retorno). O segredo vive em `sistema_rotinas`, que só o
 * service role lê. Também avisa quem ganhou prêmio no cartão fidelidade.
 */
export async function POST(request: Request) {
  const recebido = request.headers.get("x-rotina-segredo") ?? "";
  const { data } = await createAdminClient().from("sistema_rotinas").select("segredo").eq("id", 1).maybeSingle();
  if (!data?.segredo || !recebido || !igual(recebido, data.segredo)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const resumo = await executarRotinaRetorno();
  const fidelidade = await executarAvisosFidelidade();
  return Response.json({ ...resumo, fidelidade });
}
