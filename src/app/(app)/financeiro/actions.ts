"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { carregarBaseFechamento } from "@/lib/fechamento/carregar";
import { dadosRelatorio } from "@/lib/fechamento/relatorio";
import type { ItemFechamento } from "@/lib/fechamento/calcular";
import { nomeArquivoExtrato, renderFechamentoPdf, renderRelatorioPdf } from "@/lib/pdf/documentos";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp";
import { templateFechamento, templateRelatorio } from "@/lib/whatsapp-templates";
import { DateTime } from "luxon";

type ActionResult = { error: string } | { success: true };

const COMPETENCIA_RE = /^\d{4}-\d{2}-01$/;

function validarCompetencia(competencia: string): string | null {
  return COMPETENCIA_RE.test(competencia) && DateTime.fromISO(competencia).isValid ? competencia : null;
}

export async function gerarFechamentos(
  competenciaRaw: string
): Promise<{ error: string } | { success: true; gerados: number; atualizados: number; pagosMantidos: number }> {
  const competencia = validarCompetencia(competenciaRaw);
  if (!competencia) return { error: "Mês inválido." };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const [base, { data: existentes, error: erroExistentes }] = await Promise.all([
    carregarBaseFechamento(supabase, petshopId, competencia),
    supabase
      .from("fechamentos")
      .select("id, tutor_id, status")
      .eq("petshop_id", petshopId)
      .eq("competencia", competencia),
  ]);
  if (erroExistentes) return { error: mensagemErroBanco(erroExistentes) };

  const porTutor = new Map((existentes ?? []).map((f) => [f.tutor_id, f]));
  let gerados = 0;
  let atualizados = 0;
  let pagosMantidos = 0;
  const agora = new Date().toISOString();

  for (const f of base.fechamentos) {
    const existente = porTutor.get(f.tutorId);
    if (existente?.status === "pago") {
      pagosMantidos += 1;
      continue;
    }
    if (existente) {
      const { error } = await supabase
        .from("fechamentos")
        .update({ itens: f.itens, total_centavos: f.totalCentavos, atualizado_em: agora })
        .eq("id", existente.id);
      if (error) return { error: mensagemErroBanco(error) };
      atualizados += 1;
    } else {
      const { error } = await supabase.from("fechamentos").insert({
        petshop_id: petshopId,
        tutor_id: f.tutorId,
        competencia,
        itens: f.itens,
        total_centavos: f.totalCentavos,
      });
      if (error) return { error: mensagemErroBanco(error) };
      gerados += 1;
    }
  }

  // Fechamento aberto de tutor que não tem mais movimento (ex.: atendimento
  // cancelado depois de gerar) some — só se ainda não foi enviado.
  const comMovimento = new Set(base.fechamentos.map((f) => f.tutorId));
  const orfaos = (existentes ?? []).filter((f) => f.status === "aberto" && !comMovimento.has(f.tutor_id));
  if (orfaos.length > 0) {
    await supabase
      .from("fechamentos")
      .delete()
      .in("id", orfaos.map((f) => f.id))
      .is("enviado_em", null);
  }

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { success: true, gerados, atualizados, pagosMantidos };
}

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export type ResultadoEnvioLote = {
  enviados: number;
  falhas: { tutorNome: string; erro: string }[];
};

/**
 * Envia os extratos (PDF + texto) pelo WhatsApp, um por um. Cada falha é
 * registrada e devolvida — nada é lançado no meio do lote. O client manda em
 * lotes de até 25 ids.
 */
export async function enviarFechamentos(ids: string[]): Promise<ResultadoEnvioLote> {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const resultado: ResultadoEnvioLote = { enviados: 0, falhas: [] };
  if (ids.length === 0) return resultado;

  const [{ data: petshop }, { data: fechamentos }] = await Promise.all([
    supabase.from("petshops").select("nome, chave_pix, telefone, endereco").eq("id", petshopId).single(),
    supabase
      .from("fechamentos")
      .select("id, competencia, itens, total_centavos, status, tutores(nome, telefone)")
      .in("id", ids.slice(0, 25)),
  ]);
  if (!petshop) return { enviados: 0, falhas: [{ tutorNome: "—", erro: "Petshop não encontrado." }] };

  for (const f of fechamentos ?? []) {
    const tutor = um(f.tutores as Um<{ nome: string; telefone: string }>);
    if (!tutor) continue;
    try {
      const pdf = await renderFechamentoPdf({
        petshop,
        tutor,
        competencia: f.competencia,
        itens: f.itens as ItemFechamento[],
        totalCentavos: f.total_centavos,
        status: f.status as "aberto" | "pago",
      });
      const envio = await enviarMensagemWhatsapp({
        petshopId,
        numeroE164: tutor.telefone,
        tipo: "fechamento",
        documento: {
          base64: pdf.toString("base64"),
          mimetype: "application/pdf",
          nome: nomeArquivoExtrato(f.competencia, tutor.nome),
          legenda: templateFechamento({
            petshopNome: petshop.nome,
            tutorNome: tutor.nome,
            competencia: f.competencia,
            totalCentavos: f.total_centavos,
            chavePix: petshop.chave_pix,
          }),
        },
      });
      if (!envio.ok) {
        resultado.falhas.push({ tutorNome: tutor.nome, erro: envio.erro });
        continue;
      }
      await supabase.from("fechamentos").update({ enviado_em: new Date().toISOString() }).eq("id", f.id);
      resultado.enviados += 1;
    } catch (error) {
      resultado.falhas.push({
        tutorNome: tutor.nome,
        erro: error instanceof Error ? error.message : "Falha ao gerar o PDF.",
      });
    }
    // Respiro entre envios pra não bater no limite da UAZAPI.
    await new Promise((r) => setTimeout(r, 300));
  }

  revalidatePath("/financeiro");
  return resultado;
}

export async function marcarPago(id: string, pago: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fechamentos")
    .update(
      pago
        ? { status: "pago", pago_em: new Date().toISOString() }
        : { status: "aberto", pago_em: null }
    )
    .eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function enviarRelatorioDono(competenciaRaw: string): Promise<ActionResult> {
  const competencia = validarCompetencia(competenciaRaw);
  if (!competencia) return { error: "Mês inválido." };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data: petshop } = await supabase
    .from("petshops")
    .select("nome, telefone")
    .eq("id", petshopId)
    .single();
  if (!petshop?.telefone) {
    return { error: "Cadastre o WhatsApp do petshop em Configurações para receber o relatório." };
  }

  const dados = await dadosRelatorio(supabase, petshopId, competencia);
  const pdf = await renderRelatorioPdf({ petshop: { nome: petshop.nome }, ...dados });
  const mes = DateTime.fromISO(competencia).toFormat("yyyy-LL");

  const envio = await enviarMensagemWhatsapp({
    petshopId,
    numeroE164: petshop.telefone,
    tipo: "relatorio",
    documento: {
      base64: pdf.toString("base64"),
      mimetype: "application/pdf",
      nome: `relatorio-${mes}.pdf`,
      legenda: templateRelatorio({
        petshopNome: petshop.nome,
        competencia,
        faturamentoCentavos: dados.previstoCentavos,
        atendimentos: dados.atendimentos,
        planosAtivos: dados.planosAtivos,
      }),
    },
  });
  revalidatePath("/configuracoes");
  return envio.ok ? { success: true } : { error: envio.erro };
}
