"use server";

import { semPermissao } from "@/lib/acesso";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { carregarPendencias } from "@/lib/fechamento/carregar";
import { resumirFechamento } from "@/lib/fechamento/resumo";
import { dadosRelatorio } from "@/lib/fechamento/relatorio";
import { ZONE, type ItemFechamento } from "@/lib/fechamento/calcular";
import { nomeArquivoExtrato, renderFechamentoPdf, renderRelatorioPdf } from "@/lib/pdf/documentos";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp";
import { templateFechamento, templateRelatorio } from "@/lib/whatsapp-templates";
import { DateTime } from "luxon";

type ActionResult = { error: string } | { success: true };

const COMPETENCIA_RE = /^\d{4}-\d{2}-01$/;

function validarCompetencia(competencia: string): string | null {
  return COMPETENCIA_RE.test(competencia) && DateTime.fromISO(competencia).isValid ? competencia : null;
}

/**
 * Fecha tudo que ainda não foi cobrado até agora (ou até o fim do mês
 * escolhido, se for um mês passado): um extrato por cliente. O rascunho do
 * cliente (não enviado) é recalculado; extrato enviado ou pago nunca muda.
 */
export async function gerarFechamentos(
  competenciaRaw: string
): Promise<{ error: string } | { success: true; gerados: number; atualizados: number; removidos: number }> {
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return bloqueio;
  const competencia = validarCompetencia(competenciaRaw);
  if (!competencia) return { error: "Mês inválido." };

  const agora = DateTime.now().setZone(ZONE);
  const fimMes = DateTime.fromISO(competencia, { zone: ZONE }).endOf("month");
  if (DateTime.fromISO(competencia, { zone: ZONE }) > agora) {
    return { error: "Não dá pra fechar um mês que ainda não começou." };
  }
  const corte = (fimMes < agora ? fimMes : agora).toUTC().toISO()!;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { data: rascunhos, error: erroRascunhos } = await supabase
    .from("fechamentos")
    .select("id, tutor_id")
    .eq("petshop_id", petshopId)
    .eq("status", "aberto")
    .is("enviado_em", null);
  if (erroRascunhos) return { error: mensagemErroBanco(erroRascunhos) };

  const rascunhoPorTutor = new Map((rascunhos ?? []).map((r) => [r.tutor_id, r.id]));
  const { pendencias } = await carregarPendencias(supabase, petshopId, {
    competencia,
    corte,
    rascunhoIds: (rascunhos ?? []).map((r) => r.id),
  });

  let gerados = 0;
  let atualizados = 0;
  const comExtrato = new Set<string>();
  const agoraIso = new Date().toISOString();

  for (const p of pendencias) {
    // Só plano coberto e nada a pagar: não vale mandar "Total R$ 0,00".
    // Os banhos ficam pendentes e entram no próximo extrato do cliente.
    if (p.totalCentavos <= 0) continue;

    const resumo = resumirFechamento(p.itens);
    const campos = {
      competencia,
      itens: p.itens,
      total_centavos: p.totalCentavos,
      periodo_inicio: resumo.periodo?.inicioISO ?? null,
      periodo_fim: resumo.periodo?.fimISO ?? null,
      atualizado_em: agoraIso,
    };

    let fechamentoId = rascunhoPorTutor.get(p.tutorId);
    if (fechamentoId) {
      const { error } = await supabase.from("fechamentos").update(campos).eq("id", fechamentoId);
      if (error) return { error: mensagemErroBanco(error) };
      atualizados += 1;
    } else {
      const { data, error } = await supabase
        .from("fechamentos")
        .insert({ ...campos, petshop_id: petshopId, tutor_id: p.tutorId })
        .select("id")
        .single();
      if (error || !data) return { error: mensagemErroBanco(error) };
      fechamentoId = data.id;
      gerados += 1;
    }
    comExtrato.add(p.tutorId);

    // Liga os banhos a este extrato e solta os que saíram (ex.: cancelado).
    if (p.agendamentoIds.length > 0) {
      await supabase.from("agendamentos").update({ fechamento_id: fechamentoId }).in("id", p.agendamentoIds);
      await supabase
        .from("agendamentos")
        .update({ fechamento_id: null })
        .eq("fechamento_id", fechamentoId)
        .not("id", "in", `(${p.agendamentoIds.join(",")})`);
    } else {
      await supabase.from("agendamentos").update({ fechamento_id: null }).eq("fechamento_id", fechamentoId);
    }
  }

  // Rascunho de quem não tem mais nada a cobrar some (os banhos voltam a
  // ficar pendentes pelo on delete set null).
  const orfaos = (rascunhos ?? []).filter((r) => !comExtrato.has(r.tutor_id)).map((r) => r.id);
  if (orfaos.length > 0) {
    await supabase.from("fechamentos").delete().in("id", orfaos).is("enviado_em", null);
  }

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { success: true, gerados, atualizados, removidos: orfaos.length };
}

/**
 * Cliente com mais de um extrato em aberto, ou com extrato já enviado e banhos
 * novos depois (ex.: gerou no meio do mês): junta tudo no extrato mais antigo,
 * que volta a ficar "não enviado" pra mandar um só, completo — inclusive as
 * datas dos banhos do plano. Extrato pago não entra.
 */
export async function juntarExtratos(
  tutorId: string,
  competenciaRaw: string
): Promise<ActionResult> {
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return bloqueio;
  const competencia = validarCompetencia(competenciaRaw);
  if (!competencia) return { error: "Mês inválido." };

  const supabase = await createClient();
  const { data: abertos, error } = await supabase
    .from("fechamentos")
    .select("id, criado_em")
    .eq("tutor_id", tutorId)
    .eq("status", "aberto")
    .order("criado_em", { ascending: true });
  if (error) return { error: mensagemErroBanco(error) };
  if (!abertos || abertos.length === 0) return { error: "Esse cliente não tem extrato em aberto." };

  const [manter, ...outros] = abertos;
  const outrosIds = outros.map((o) => o.id);
  // Os banhos dos outros voltam a ficar pendentes e entram no que fica.
  const { error: erroSoltar } = await supabase
    .from("agendamentos")
    .update({ fechamento_id: null })
    .in("fechamento_id", outrosIds);
  if (erroSoltar) return { error: mensagemErroBanco(erroSoltar) };
  const { error: erroApagar } = await supabase.from("fechamentos").delete().in("id", outrosIds);
  if (erroApagar) return { error: mensagemErroBanco(erroApagar) };
  const { error: erroReabrir } = await supabase
    .from("fechamentos")
    .update({ enviado_em: null })
    .eq("id", manter.id);
  if (erroReabrir) return { error: mensagemErroBanco(erroReabrir) };

  const r = await gerarFechamentos(competencia);
  if ("error" in r) return r;
  return { success: true };
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
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return { enviados: 0, falhas: [{ tutorNome: "—", erro: bloqueio.error }] };
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const resultado: ResultadoEnvioLote = { enviados: 0, falhas: [] };
  if (ids.length === 0) return resultado;

  const [{ data: petshop }, { data: fechamentos }] = await Promise.all([
    supabase.from("petshops").select("nome, chave_pix, telefone, endereco, modelos_mensagem").eq("id", petshopId).single(),
    supabase
      .from("fechamentos")
      .select("id, tutor_id, competencia, itens, total_centavos, status, tutores(nome, telefone)")
      .in("id", ids.slice(0, 25)),
  ]);
  if (!petshop) return { enviados: 0, falhas: [{ tutorNome: "—", erro: "Petshop não encontrado." }] };

  for (const f of fechamentos ?? []) {
    const tutor = um(f.tutores as Um<{ nome: string; telefone: string }>);
    if (!tutor) continue;
    try {
      const itens = f.itens as ItemFechamento[];
      const pdf = await renderFechamentoPdf({
        petshop,
        tutor,
        competencia: f.competencia,
        itens,
        totalCentavos: f.total_centavos,
        status: f.status as "aberto" | "pago",
      });

      // 1) O texto, no formato que o petshop já manda (datas, quantos
      //    banhos, total, Pix). 2) O PDF logo abaixo.
      const texto = await enviarMensagemWhatsapp({
        petshopId,
        tutorId: f.tutor_id,
        numeroE164: tutor.telefone,
        tipo: "fechamento",
        texto: templateFechamento({
          petshop: { nome: petshop.nome, endereco: petshop.endereco, modelos: petshop.modelos_mensagem },
          tutorNome: tutor.nome,
          resumo: resumirFechamento(itens),
          chavePix: petshop.chave_pix,
        }),
      });
      if (!texto.ok) {
        resultado.falhas.push({ tutorNome: tutor.nome, erro: texto.erro });
        continue;
      }
      const documento = await enviarMensagemWhatsapp({
        petshopId,
        tutorId: f.tutor_id,
        numeroE164: tutor.telefone,
        tipo: "fechamento",
        documento: {
          base64: pdf.toString("base64"),
          mimetype: "application/pdf",
          nome: nomeArquivoExtrato(f.competencia, tutor.nome),
        },
      });
      if (!documento.ok) {
        resultado.falhas.push({ tutorNome: tutor.nome, erro: `Texto enviado, PDF falhou: ${documento.erro}` });
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
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return bloqueio;
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
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return bloqueio;
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
