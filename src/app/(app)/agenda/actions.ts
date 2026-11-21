"use server";

import { semPermissao } from "@/lib/acesso";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { AGENDAMENTO_STATUSES, type AgendamentoStatus } from "@/lib/agendamento";
import { mensagemErroBanco } from "@/lib/db-errors";
import { notificarAgendamento, notificarDiaCancelado } from "@/lib/agenda/notificar";
import { lerLembretes } from "@/lib/avisos";
import { appUrl } from "@/lib/app-url";
import { lerAdicionais, type Adicional } from "@/lib/adicionais";
import { precoParaPorte } from "@/lib/servico-preco";
import { normalizePhoneBR } from "@/lib/phone";
import { DateTime } from "luxon";
import { ZONE } from "@/lib/agenda/slots";
import {
  doBanco,
  duracaoServicosExtras,
  lerPedidosExtras,
  paraBanco,
  somaServicosExtras,
  type ServicoExtra,
  type ServicoExtraPedido,
} from "@/lib/servicos-extras";
import { somaAdicionais } from "@/lib/adicionais";
import { lancarEntrada } from "@/lib/lancamentos-entrada";
import { hojeISO } from "@/lib/lancamentos";

type ActionResult = { error: string } | { success: true };

/**
 * "Avisar o tutor pelo WhatsApp" marcado no formulário: a confirmação com os
 * botões Confirmar/Cancelar sai depois da resposta, sem segurar a tela.
 */
function avisarDepois(formData: FormData, petshopId: string, agendamentoId: string) {
  if (formData.get("avisar") !== "on") return;
  after(async () => {
    await notificarAgendamento(petshopId, agendamentoId, "confirmacao");
  });
}

/**
 * Lembretes escolhidos no formulário ("24,4"; vazio = nenhum). Sem o campo,
 * vale o padrão do petshop, que o banco preenche sozinho.
 */
function lembretesDoFormulario(formData: FormData): { lembretes: number[] } | null {
  const bruto = formData.get("lembretes");
  if (bruto === null) return null;
  const horas = String(bruto)
    .split(",")
    .filter(Boolean)
    .map((h) => ({ horas: Number(h), ativo: true }));
  return { lembretes: lerLembretes(horas).map((l) => l.horas) };
}

/**
 * Duração e preço do serviço pro porte do pet. Sempre do banco — nunca
 * confiamos num "fim" ou valor calculado no cliente. O preço fica congelado
 * no agendamento pra o fechamento não mudar se o serviço for editado.
 */
async function servicoParaPet(
  supabase: SupabaseClient,
  servicoId: string,
  petId: string
): Promise<{ nome: string; duracaoMin: number; precoCentavos: number } | null> {
  const [{ data: servico }, { data: pet }] = await Promise.all([
    supabase
      .from("servicos")
      .select("nome, duracao_min, preco_centavos, preco_pequeno_centavos, preco_medio_centavos, preco_grande_centavos")
      .eq("id", servicoId)
      .maybeSingle(),
    supabase.from("pets").select("porte").eq("id", petId).maybeSingle(),
  ]);
  if (!servico) return null;
  return { nome: servico.nome, duracaoMin: servico.duracao_min, precoCentavos: precoParaPorte(servico, pet?.porte) };
}

type InfoServico = { nome: string; duracaoMin: number; precoCentavos: number };

/** Nome, duração e preço (pelo porte) de cada serviço extra pedido. */
async function infosDosExtras(
  supabase: SupabaseClient,
  pedidos: ServicoExtraPedido[],
  petId: string
): Promise<Map<string, InfoServico> | { error: string }> {
  const infos = new Map<string, InfoServico>();
  for (const p of pedidos) {
    const info = await servicoParaPet(supabase, p.servicoId, petId);
    if (!info) return { error: "Serviço extra não encontrado" };
    infos.set(p.servicoId, info);
  }
  return infos;
}

/**
 * Monta os serviços extras do agendamento já criado. Quem pediu crédito do
 * plano tenta consumir (a function confere o saldo do mês); sem crédito,
 * entra com o valor informado ou o preço do serviço. `anteriores` mantém a
 * cobertura de quem já usava crédito e devolve o crédito de quem saiu.
 */
async function aplicarExtras(
  supabase: SupabaseClient,
  agendamentoId: string,
  pedidos: ServicoExtraPedido[],
  infos: Map<string, InfoServico>,
  anteriores: ServicoExtra[] = []
): Promise<ServicoExtra[]> {
  for (const antigo of anteriores) {
    if (!antigo.assinaturaId) continue;
    const pedido = pedidos.find((p) => p.servicoId === antigo.servicoId);
    if (!pedido || !pedido.usarPlano) {
      await supabase.rpc("estornar_credito_servico", {
        p_agendamento_id: agendamentoId,
        p_servico_id: antigo.servicoId,
      });
    }
  }

  const nomesPlano = new Map<string, string>();
  const resultado: ServicoExtra[] = [];
  for (const p of pedidos) {
    const info = infos.get(p.servicoId)!;
    let assinaturaId: string | null = null;
    if (p.usarPlano) {
      const { data } = await supabase.rpc("consumir_credito_servico", {
        p_agendamento_id: agendamentoId,
        p_servico_id: p.servicoId,
      });
      assinaturaId = (data as string | null) ?? null;
    }
    let planoNome: string | null = null;
    if (assinaturaId) {
      if (!nomesPlano.has(assinaturaId)) {
        const { data } = await supabase
          .from("assinaturas")
          .select("planos(nome)")
          .eq("id", assinaturaId)
          .maybeSingle();
        const plano = data?.planos as unknown as { nome: string } | { nome: string }[] | null;
        nomesPlano.set(assinaturaId, (Array.isArray(plano) ? plano[0]?.nome : plano?.nome) ?? "Plano");
      }
      planoNome = nomesPlano.get(assinaturaId)!;
    }
    resultado.push({
      servicoId: p.servicoId,
      nome: info.nome,
      duracaoMin: info.duracaoMin,
      valorCentavos: assinaturaId ? 0 : (p.valorCentavos ?? info.precoCentavos),
      assinaturaId,
      planoNome,
    });
  }
  return resultado;
}

/** Valor do serviço principal digitado no formulário (centavos); vazio = preço do serviço. */
function valorDoFormulario(formData: FormData): number | null | { error: string } {
  const bruto = formData.get("valor");
  if (bruto === null || String(bruto).trim() === "") return null;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 0 || n > 10_000_00) return { error: "Valor do serviço inválido" };
  return n;
}

const agendamentoFields = z.object({
  pet_id: z.string().trim().min(1, "Selecione o pet"),
  servico_id: z.string().trim().min(1, "Selecione o serviço"),
  inicio: z.string().trim().min(1, "Selecione o horário"),
  observacoes: z.string().trim(),
});

function lerFormulario(formData: FormData) {
  const parsed = agendamentoFields.safeParse({
    pet_id: formData.get("pet_id"),
    servico_id: formData.get("servico_id"),
    inicio: formData.get("inicio"),
    observacoes: formData.get("observacoes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" } as const;
  }
  const inicio = new Date(parsed.data.inicio);
  if (Number.isNaN(inicio.getTime())) return { error: "Horário inválido" } as const;
  const extras = lerAdicionais(formData.get("adicionais"));
  if (!extras.ok) return { error: extras.erro } as const;
  const servicosExtras = lerPedidosExtras(formData.get("servicos_extras"));
  if (!servicosExtras.ok) return { error: servicosExtras.erro } as const;
  if (servicosExtras.pedidos.some((p) => p.servicoId === parsed.data.servico_id)) {
    return { error: "O serviço principal não pode aparecer de novo nos serviços extras." } as const;
  }
  const valor = valorDoFormulario(formData);
  if (valor !== null && typeof valor === "object") return { error: valor.error } as const;
  return {
    dados: parsed.data,
    inicio,
    adicionais: extras.adicionais,
    pedidosExtras: servicosExtras.pedidos,
    valor,
  } as const;
}

const REPETICOES = {
  semanal: { semanas: 1, rotulo: "toda semana" },
  quinzenal: { semanas: 2, rotulo: "a cada 2 semanas" },
  mensal: { semanas: 4, rotulo: "a cada 4 semanas" },
} as const;
const MAX_REPETICOES = 12;

/** "Repetir toda semana, 4 vezes" → as datas da série (a primeira incluída). */
function datasDaSerie(inicio: Date, formData: FormData): Date[] | { error: string } {
  const repetir = String(formData.get("repetir") ?? "nao");
  if (repetir === "nao" || !repetir) return [inicio];
  const regra = REPETICOES[repetir as keyof typeof REPETICOES];
  if (!regra) return { error: "Repetição inválida" };
  const vezes = Number(formData.get("vezes"));
  if (!Number.isInteger(vezes) || vezes < 2 || vezes > MAX_REPETICOES) {
    return { error: `Repita de 2 a ${MAX_REPETICOES} vezes.` };
  }
  // Soma em dias de calendário no fuso do petshop: 9h continua 9h depois do
  // horário de verão, se ele voltar.
  const base = DateTime.fromJSDate(inicio).setZone(ZONE);
  return Array.from({ length: vezes }, (_, i) => base.plus({ weeks: i * regra.semanas }).toJSDate());
}

type ResultadoCriacao = { error: string } | { success: true; criados: number; avisos: string[] };

function rotuloData(d: Date): string {
  return DateTime.fromJSDate(d).setZone(ZONE).toFormat("dd/LL");
}

/**
 * Cria o agendamento — ou a série, se "repetir" veio no formulário. Com
 * plano, cada data tenta usar crédito (inclusive de meses futuros, pelo
 * saldo_plano); sem crédito naquela data, entra como avulso e avisa. Datas
 * com o horário lotado são puladas e avisadas; o resto da série é criado.
 */
async function criarAgendamentos(formData: FormData, usarPlano: boolean): Promise<ResultadoCriacao> {
  const form = lerFormulario(formData);
  if ("error" in form) return { error: form.error ?? "Dados inválidos" };
  const { dados, inicio, adicionais, pedidosExtras, valor } = form;
  const datas = datasDaSerie(inicio, formData);
  if ("error" in datas) return datas;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const servico = await servicoParaPet(supabase, dados.servico_id, dados.pet_id);
  if (!servico) return { error: "Serviço não encontrado" };
  const infos = await infosDosExtras(supabase, pedidosExtras, dados.pet_id);
  if ("error" in infos) return infos;
  const duracaoTotal = servico.duracaoMin + duracaoServicosExtras(Array.from(infos.values()));

  const avisosEscolhidos = lembretesDoFormulario(formData);
  const recorrenciaId = datas.length > 1 ? crypto.randomUUID() : null;
  const criados: string[] = [];
  const avisos: string[] = [];
  let primeiroErro: string | null = null;

  for (const data of datas) {
    let id: string | null = null;

    if (usarPlano) {
      // Toda a validação (plano ativo, saldo) e o consumo do crédito ficam na
      // function — mesma regra pra qualquer chamador. A lotação do horário é
      // do trigger checar_capacidade_agenda.
      const { data: agId, error } = await supabase.rpc("agendar_com_plano", {
        p_pet_id: dados.pet_id,
        p_servico_id: dados.servico_id,
        p_inicio: data.toISOString(),
        p_observacoes: dados.observacoes || null,
        p_fim: new Date(data.getTime() + duracaoTotal * 60_000).toISOString(),
      });
      if (!error && agId) {
        id = agId as string;
        const extras: Record<string, unknown> = {};
        // O plano cobre o banho; os extras são cobrados à parte no fechamento.
        if (adicionais.length > 0) extras.adicionais = adicionais;
        if (recorrenciaId) extras.recorrencia_id = recorrenciaId;
        if (avisosEscolhidos) extras.avisos = avisosEscolhidos;
        if (Object.keys(extras).length > 0) {
          await supabase.from("agendamentos").update(extras).eq("id", id);
        }
      } else if (!error?.message?.includes("Sem créditos") || datas.length === 1) {
        const msg = mensagemErroBanco(error);
        primeiroErro ??= msg;
        avisos.push(`${rotuloData(data)}: ${msg}`);
        continue;
      } else {
        avisos.push(`${rotuloData(data)}: sem crédito do plano — entrou como avulso`);
      }
    }

    if (!id) {
      const fim = new Date(data.getTime() + duracaoTotal * 60_000);
      const { data: criado, error } = await supabase
        .from("agendamentos")
        .insert({
          petshop_id: petshopId,
          pet_id: dados.pet_id,
          servico_id: dados.servico_id,
          inicio: data.toISOString(),
          fim: fim.toISOString(),
          observacoes: dados.observacoes || null,
          valor_centavos: valor ?? servico.precoCentavos,
          adicionais,
          recorrencia_id: recorrenciaId,
          ...(avisosEscolhidos ? { avisos: avisosEscolhidos } : {}),
        })
        .select("id")
        .single();
      if (error || !criado) {
        const msg = mensagemErroBanco(error);
        primeiroErro ??= msg;
        avisos.push(`${rotuloData(data)}: ${msg}`);
        continue;
      }
      id = criado.id;
    }
    if (pedidosExtras.length > 0) {
      const extras = await aplicarExtras(supabase, id!, pedidosExtras, infos);
      await supabase.from("agendamentos").update({ servicos_extras: paraBanco(extras) }).eq("id", id!);
    }
    criados.push(id!);
  }

  if (criados.length === 0) return { error: primeiroErro ?? "Não foi possível agendar." };

  // Numa série, só a primeira data vai pro WhatsApp — o lembrete das outras
  // sai pelo botão de lembrete, perto do dia.
  avisarDepois(formData, petshopId, criados[0]);
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: true, criados: criados.length, avisos: datas.length > 1 ? avisos : [] };
}

export async function createAgendamento(formData: FormData): Promise<ResultadoCriacao> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  return criarAgendamentos(formData, false);
}

export async function createAgendamentoComPlano(formData: FormData): Promise<ResultadoCriacao> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  return criarAgendamentos(formData, true);
}

export async function updateAgendamentoStatus(
  id: string,
  status: AgendamentoStatus
): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  if (!AGENDAMENTO_STATUSES.includes(status)) {
    return { error: "Status inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("agendamentos")
    .update({ status })
    .eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
  return { success: true };
}

/**
 * Edita horário, serviço, valor, serviços extras, observações e adicionais.
 * Atendimento pago com plano não troca o serviço principal (o crédito está
 * amarrado a ele). A duração sempre vem dos serviços no banco, pelo porte do
 * pet; o valor pode ser ajustado à mão (desconto, cliente antigo...).
 */
export async function updateAgendamento(
  id: string,
  dados: {
    inicio: string;
    servicoId: string;
    observacoes: string;
    adicionais?: Adicional[];
    /** Valor do serviço principal; null/ausente = mantém o combinado ou o preço do serviço. */
    valorCentavos?: number | null;
    servicosExtras?: ServicoExtraPedido[];
  }
): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const inicio = new Date(dados.inicio);
  if (Number.isNaN(inicio.getTime())) return { error: "Horário inválido" };
  if (!dados.servicoId) return { error: "Selecione o serviço" };
  let adicionais: Adicional[] | undefined;
  if (dados.adicionais !== undefined) {
    const extras = lerAdicionais(dados.adicionais);
    if (!extras.ok) return { error: extras.erro };
    adicionais = extras.adicionais;
  }
  let pedidos: ServicoExtraPedido[] | undefined;
  if (dados.servicosExtras !== undefined) {
    const lidos = lerPedidosExtras(dados.servicosExtras);
    if (!lidos.ok) return { error: lidos.erro };
    pedidos = lidos.pedidos;
    if (pedidos.some((p) => p.servicoId === dados.servicoId)) {
      return { error: "O serviço principal não pode aparecer de novo nos serviços extras." };
    }
  }
  if (
    dados.valorCentavos != null &&
    (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos < 0 || dados.valorCentavos > 10_000_00)
  ) {
    return { error: "Valor do serviço inválido" };
  }

  const supabase = await createClient();

  const { data: atual } = await supabase
    .from("agendamentos")
    .select("id, pet_id, servico_id, origem_plano, status, valor_centavos, fidelidade_resgate, servicos_extras, pago_em, adicionais")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { error: "Agendamento não encontrado." };
  if (atual.fidelidade_resgate && dados.servicoId !== atual.servico_id) {
    return { error: "Esse atendimento usa o prêmio fidelidade. Desfaça o prêmio antes de trocar o serviço." };
  }
  if (atual.status === "concluido" || atual.status === "cancelado") {
    return { error: "Agendamento encerrado não pode ser alterado. Reabra ele primeiro." };
  }
  if (atual.origem_plano && dados.servicoId !== atual.servico_id) {
    return { error: "Esse atendimento usa crédito do plano — dá pra mudar o horário, não o serviço." };
  }

  const servico = await servicoParaPet(supabase, dados.servicoId, atual.pet_id);
  if (!servico) return { error: "Serviço não encontrado" };

  const anteriores = doBanco(atual.servicos_extras);
  const infos = pedidos ? await infosDosExtras(supabase, pedidos, atual.pet_id) : null;
  if (infos && "error" in infos) return infos;
  const duracaoExtras = infos ? duracaoServicosExtras(Array.from(infos.values())) : duracaoServicosExtras(anteriores);
  const fim = new Date(inicio.getTime() + (servico.duracaoMin + duracaoExtras) * 60_000);

  // Mesmo serviço: mantém o preço combinado na hora de marcar.
  const mesmoServico = dados.servicoId === atual.servico_id;
  const valor = atual.origem_plano
    ? 0
    : dados.valorCentavos != null
      ? dados.valorCentavos
      : mesmoServico && atual.valor_centavos != null
        ? atual.valor_centavos
        : servico.precoCentavos;

  if (atual.pago_em) {
    // Já recebido no caixa: horário e observação mudam, o total não.
    const extrasNovos = pedidos
      ? pedidos.reduce((soma, p) => {
          const antigo = anteriores.find((x) => x.servicoId === p.servicoId);
          if (p.usarPlano && antigo?.assinaturaId) return soma;
          const info = infos && !("error" in infos) ? infos.get(p.servicoId) : undefined;
          return soma + (p.valorCentavos ?? antigo?.valorCentavos ?? info?.precoCentavos ?? 0);
        }, 0)
      : somaServicosExtras(anteriores);
    const adicAntigos = lerAdicionais(atual.adicionais);
    const somaAdicAntigos = adicAntigos.ok ? somaAdicionais(adicAntigos.adicionais) : 0;
    const totalNovo = valor + extrasNovos + (adicionais !== undefined ? somaAdicionais(adicionais) : somaAdicAntigos);
    if (totalNovo !== totalDoAgendamento(atual)) {
      return { error: "Esse atendimento já foi recebido no caixa. Desfaça o recebimento antes de mudar valores." };
    }
  }

  const { error } = await supabase
    .from("agendamentos")
    .update({
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      servico_id: dados.servicoId,
      observacoes: dados.observacoes.trim() || null,
      valor_centavos: valor,
      ...(adicionais !== undefined ? { adicionais } : {}),
    })
    .eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  if (pedidos && infos && !("error" in infos)) {
    // Quem já usava crédito continua usando (a function não consome de novo).
    const extras = await aplicarExtras(supabase, id, pedidos, infos, anteriores);
    const { error: erroExtras } = await supabase
      .from("agendamentos")
      .update({ servicos_extras: paraBanco(extras) })
      .eq("id", id);
    if (erroExtras) return { error: mensagemErroBanco(erroExtras) };
  }

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: true };
}

type SituacaoExtrato =
  | { bloqueado: false }
  | { bloqueado: true; fechamentoId: string; pago: boolean };

/** Agendamento num extrato já enviado ou pago não muda sem reabrir o extrato. */
async function situacaoExtrato(supabase: SupabaseClient, fechamentoId: string | null): Promise<SituacaoExtrato> {
  if (!fechamentoId) return { bloqueado: false };
  const { data } = await supabase
    .from("fechamentos")
    .select("id, status, enviado_em")
    .eq("id", fechamentoId)
    .maybeSingle();
  if (!data || (data.status !== "pago" && !data.enviado_em)) return { bloqueado: false };
  return { bloqueado: true, fechamentoId: data.id, pago: data.status === "pago" };
}

export type ResultadoReabrir =
  | { success: true }
  | { error: string; extratoBloqueado?: { pago: boolean } };

const MSG_EXTRATO_ENVIADO =
  "Esse atendimento já está num extrato enviado ao tutor. Reabra o extrato para poder mexer.";
const MSG_EXTRATO_PAGO =
  "Esse atendimento está num extrato já pago. Reabra o extrato (o pagamento sai do caixa) para poder mexer.";

/** Concluído, falta ou cancelado volta a ficar agendado. */
export async function reabrirAgendamento(id: string): Promise<ResultadoReabrir> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("agendamentos")
    .select("id, status, fechamento_id")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { error: "Agendamento não encontrado." };
  if (atual.status === "agendado" || atual.status === "confirmado") return { success: true };

  const extrato = await situacaoExtrato(supabase, atual.fechamento_id);
  if (extrato.bloqueado) {
    return {
      error: extrato.pago ? MSG_EXTRATO_PAGO : MSG_EXTRATO_ENVIADO,
      extratoBloqueado: { pago: extrato.pago },
    };
  }

  const { error } = await supabase.from("agendamentos").update({ status: "agendado" }).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
  return { success: true };
}

/**
 * Apaga o agendamento de vez: os créditos do plano voltam, o recebimento no
 * caixa (se houver) sai junto e o horário fica livre.
 */
export async function apagarAgendamento(id: string): Promise<ResultadoReabrir> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("agendamentos")
    .select("id, fechamento_id, pago_em")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { error: "Agendamento não encontrado." };

  const extrato = await situacaoExtrato(supabase, atual.fechamento_id);
  if (extrato.bloqueado) {
    return {
      error: extrato.pago ? MSG_EXTRATO_PAGO : MSG_EXTRATO_ENVIADO,
      extratoBloqueado: { pago: extrato.pago },
    };
  }

  if (atual.pago_em) {
    // Lançamentos do caixa exigem a permissão do financeiro (RLS).
    const { error: erroCaixa } = await supabase.from("lancamentos").delete().eq("agendamento_id", id);
    if (erroCaixa) return { error: "Esse atendimento foi recebido no caixa. Quem tem acesso ao financeiro precisa apagar." };
  }

  const { error } = await supabase.from("agendamentos").delete().eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
  revalidatePath("/caixa");
  return { success: true };
}

/**
 * Reabre, de dentro do agendamento, o extrato em que ele está: enviado volta
 * a "não enviado"; pago volta a "em aberto" e o pagamento sai do caixa.
 */
export async function reabrirExtratoDoAgendamento(id: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("financeiro");
  if (bloqueio) return { error: "Reabrir o extrato precisa da permissão do Financeiro." };
  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("agendamentos")
    .select("fechamento_id")
    .eq("id", id)
    .maybeSingle();
  if (!atual?.fechamento_id) return { success: true };
  const fechamentoId = atual.fechamento_id;

  const { data: fechamento } = await supabase
    .from("fechamentos")
    .select("status")
    .eq("id", fechamentoId)
    .maybeSingle();
  if (fechamento?.status === "pago") {
    const { error: erroCaixa } = await supabase
      .from("lancamentos")
      .delete()
      .eq("fechamento_id", fechamentoId)
      .eq("origem", "extrato");
    if (erroCaixa) return { error: mensagemErroBanco(erroCaixa) };
  }
  const { error } = await supabase
    .from("fechamentos")
    .update({ status: "aberto", pago_em: null, enviado_em: null })
    .eq("id", fechamentoId);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  revalidatePath("/caixa");
  return { success: true };
}

/** Total a receber do atendimento: serviço (se não é do plano) + extras + adicionais. */
function totalDoAgendamento(row: {
  origem_plano: boolean;
  valor_centavos: number | null;
  adicionais: unknown;
  servicos_extras: unknown;
}): number {
  const adic = lerAdicionais(row.adicionais);
  return (
    (row.origem_plano ? 0 : (row.valor_centavos ?? 0)) +
    (adic.ok ? somaAdicionais(adic.adicionais) : 0) +
    somaServicosExtras(doBanco(row.servicos_extras))
  );
}

/**
 * Recebe o avulso na hora, pelo próprio agendamento: o valor entra no caixa
 * (com a taxa e o prazo da forma de pagamento) e o atendimento aparece no
 * extrato do tutor como "pago no caixa", sem somar no total a pagar.
 */
export async function receberNoCaixa(
  id: string,
  pagamento: { metodoId: string; parcelas: number; data: string }
): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  if (!pagamento.metodoId) return { error: "Escolha a forma de pagamento." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pagamento.data) || !DateTime.fromISO(pagamento.data).isValid) {
    return { error: "Data inválida." };
  }
  if (pagamento.data > hojeISO()) return { error: "A data do pagamento não pode ser no futuro." };
  const parcelas = Math.trunc(pagamento.parcelas);
  if (!(parcelas >= 1 && parcelas <= 12)) return { error: "Parcelas inválidas." };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data: ag } = await supabase
    .from("agendamentos")
    .select(
      "id, status, origem_plano, valor_centavos, adicionais, servicos_extras, pago_em, fechamento_id, pets(nome, tutores(nome)), servicos(nome)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!ag) return { error: "Agendamento não encontrado." };
  if (ag.pago_em) return { error: "Esse atendimento já foi recebido." };
  if (ag.status === "cancelado" || ag.status === "faltou") return { error: "Atendimento cancelado ou com falta não é cobrado." };
  const extrato = await situacaoExtrato(supabase, ag.fechamento_id);
  if (extrato.bloqueado) return { error: "Esse atendimento já está num extrato enviado. Receba pelo Financeiro." };

  const total = totalDoAgendamento(ag);
  if (total <= 0) return { error: "Nada a receber neste atendimento." };

  const pet = ag.pets as unknown as { nome: string; tutores: { nome: string } | null } | null;
  const servico = ag.servicos as unknown as { nome: string } | null;
  const { data: categoria } = await supabase
    .from("categorias_financeiras")
    .select("id")
    .eq("tipo", "entrada")
    .eq("nome", "Banho e tosa")
    .maybeSingle();

  const entrada = await lancarEntrada(supabase, {
    petshopId,
    valorCentavos: total,
    metodoId: pagamento.metodoId,
    parcelas,
    data: pagamento.data,
    descricao: [servico?.nome, pet?.nome, pet?.tutores?.nome].filter(Boolean).join(" · "),
    categoriaId: categoria?.id ?? null,
    caixaId: null,
    origem: "agendamento",
    agendamentoId: id,
  });
  if ("error" in entrada) {
    return {
      error: entrada.error.toLowerCase().includes("row-level security") || entrada.error.toLowerCase().includes("permiss")
        ? "Lançar no caixa precisa da permissão do Financeiro."
        : entrada.error,
    };
  }

  const { error } = await supabase
    .from("agendamentos")
    .update({ pago_em: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    await supabase.from("lancamentos").delete().eq("agendamento_id", id);
    return { error: mensagemErroBanco(error) };
  }

  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  revalidatePath("/caixa");
  return { success: true };
}

/** Desfaz o recebimento: sai do caixa e volta a entrar no extrato do tutor. */
export async function desfazerRecebimento(id: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { data: ag } = await supabase
    .from("agendamentos")
    .select("id, fechamento_id")
    .eq("id", id)
    .maybeSingle();
  if (!ag) return { error: "Agendamento não encontrado." };
  const extrato = await situacaoExtrato(supabase, ag.fechamento_id);
  if (extrato.bloqueado) return { error: extrato.pago ? MSG_EXTRATO_PAGO : MSG_EXTRATO_ENVIADO };

  const { error: erroCaixa } = await supabase.from("lancamentos").delete().eq("agendamento_id", id);
  if (erroCaixa) return { error: "Tirar do caixa precisa da permissão do Financeiro." };
  const { error } = await supabase.from("agendamentos").update({ pago_em: null }).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  revalidatePath("/caixa");
  return { success: true };
}

/**
 * Adicionais podem ser lançados depois do banho (ex.: descobriu nós na hora),
 * inclusive em atendimento concluído — só não mexe em extrato já enviado ou
 * pago.
 */
export async function atualizarAdicionais(id: string, adicionaisRaw: Adicional[]): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const extras = lerAdicionais(adicionaisRaw);
  if (!extras.ok) return { error: extras.erro };

  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("agendamentos")
    .select("id, status, pago_em, fechamentos(status, enviado_em)")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { error: "Agendamento não encontrado." };
  if (atual.status === "cancelado") return { error: "Agendamento cancelado não recebe adicionais." };
  if (atual.pago_em) {
    return { error: "Esse atendimento já foi recebido no caixa. Desfaça o recebimento antes de mudar valores." };
  }
  const fechamento = atual.fechamentos as unknown as { status: string; enviado_em: string | null } | null;
  if (fechamento && (fechamento.status === "pago" || fechamento.enviado_em)) {
    return { error: "Esse atendimento já foi cobrado num extrato enviado. Lance o extra no próximo atendimento." };
  }

  const { error } = await supabase.from("agendamentos").update({ adicionais: extras.adicionais }).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  return { success: true };
}

/** Arrastar na grade: só o horário muda. */
export async function moverAgendamento(id: string, inicioISO: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("agendamentos")
    .select("servico_id, observacoes")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { error: "Agendamento não encontrado." };
  return updateAgendamento(id, {
    inicio: inicioISO,
    servicoId: atual.servico_id,
    observacoes: atual.observacoes ?? "",
  });
}

export async function enviarLembrete(agendamentoId: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const resultado = await notificarAgendamento(petshopId, agendamentoId, "lembrete");
  return resultado.ok ? { success: true } : { error: resultado.erro };
}

const novoClienteFields = z.object({
  tutorId: z.string().trim(),
  tutorNome: z.string().trim(),
  tutorTelefone: z.string().trim(),
  petNome: z.string().trim().min(1, "Nome do pet é obrigatório"),
  especie: z.enum(["cachorro", "gato", "outro"]),
  porte: z.enum(["pequeno", "medio", "grande", ""]),
});

export type PetCriado = { id: string; nome: string; tutorId: string; tutorNome: string; porte: string | null };

/**
 * Cadastro rápido direto do agendamento: um pet novo, pra um cliente que já
 * existe ou que é cadastrado junto.
 */
export async function criarClienteEPet(
  dados: z.input<typeof novoClienteFields>
): Promise<{ error: string } | { success: true; pet: PetCriado }> {
  const bloqueio = await semPermissao("agenda", "clientes");
  if (bloqueio) return bloqueio;
  const parsed = novoClienteFields.safeParse(dados);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  let tutorId = d.tutorId;
  let tutorNome = "";
  if (tutorId) {
    const { data: tutor } = await supabase.from("tutores").select("id, nome").eq("id", tutorId).maybeSingle();
    if (!tutor) return { error: "Cliente não encontrado." };
    tutorNome = tutor.nome;
  } else {
    if (d.tutorNome.length < 2) return { error: "Informe o nome do cliente." };
    const telefone = normalizePhoneBR(d.tutorTelefone);
    if (!telefone) return { error: "WhatsApp do cliente inválido. Use DDD + número." };

    const { data: existente } = await supabase
      .from("tutores")
      .select("nome")
      .eq("telefone", telefone)
      .eq("ativo", true)
      .maybeSingle();
    if (existente) {
      return { error: `Já existe um cliente com esse WhatsApp: ${existente.nome}. Escolha ele na lista.` };
    }

    const { data: tutor, error } = await supabase
      .from("tutores")
      .insert({ petshop_id: petshopId, nome: d.tutorNome, telefone })
      .select("id, nome")
      .single();
    if (error || !tutor) return { error: mensagemErroBanco(error, { duplicado: "Já existe um cliente com esse WhatsApp." }) };
    tutorId = tutor.id;
    tutorNome = tutor.nome;
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .insert({
      petshop_id: petshopId,
      tutor_id: tutorId,
      nome: d.petNome,
      especie: d.especie,
      porte: d.porte || null,
    })
    .select("id, nome, porte")
    .single();
  if (petError || !pet) return { error: mensagemErroBanco(petError, { fallback: "Não foi possível cadastrar o pet." }) };

  revalidatePath("/agenda");
  revalidatePath("/tutores-pets");
  return { success: true, pet: { id: pet.id, nome: pet.nome, tutorId, tutorNome, porte: pet.porte } };
}

/** Troca os lembretes automáticos de um atendimento (lista de horas antes; vazia = nenhum). */
export async function atualizarAvisos(id: string, horas: number[]): Promise<ActionResult> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const lembretes = lerLembretes(horas.map((h) => ({ horas: h, ativo: true }))).map((l) => l.horas);

  const supabase = await createClient();
  const { data: atual } = await supabase.from("agendamentos").select("id, status").eq("id", id).maybeSingle();
  if (!atual) return { error: "Agendamento não encontrado." };
  if (atual.status === "concluido" || atual.status === "cancelado" || atual.status === "faltou") {
    return { error: "Esse atendimento já foi encerrado." };
  }
  const { error } = await supabase.from("agendamentos").update({ avisos: { lembretes } }).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };
  revalidatePath("/agenda");
  return { success: true };
}

const MAX_CANCELAR_DIA = 100;

/**
 * Cancela todos os atendimentos marcados de um dia (feriado, imprevisto).
 * O crédito do plano volta sozinho pelo gatilho do banco. Com `avisar`, cada
 * tutor recebe o aviso no WhatsApp, com o motivo e o link pra remarcar.
 */
export async function cancelarDia(
  dataISO: string,
  opcoes: { avisar: boolean; motivo: string }
): Promise<{ error: string } | { success: true; cancelados: number; avisados: boolean }> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const dia = DateTime.fromISO(dataISO, { zone: ZONE });
  if (!dia.isValid) return { error: "Data inválida." };
  const motivo = opcoes.motivo.trim().slice(0, 200);

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data: lista, error: erroLer } = await supabase
    .from("agendamentos")
    .select("id")
    .eq("petshop_id", petshopId)
    .in("status", ["agendado", "confirmado"])
    .gte("inicio", dia.startOf("day").toUTC().toISO()!)
    .lt("inicio", dia.plus({ days: 1 }).startOf("day").toUTC().toISO()!);
  if (erroLer) return { error: mensagemErroBanco(erroLer) };
  const ids = (lista ?? []).map((a) => a.id);
  if (ids.length === 0) return { error: "Não há atendimentos marcados nesse dia." };
  if (ids.length > MAX_CANCELAR_DIA) return { error: `São ${ids.length} atendimentos: cancele em partes ou fale com o suporte.` };

  const { error } = await supabase.from("agendamentos").update({ status: "cancelado" }).in("id", ids);
  if (error) return { error: mensagemErroBanco(error) };

  let avisados = false;
  if (opcoes.avisar) {
    const { data: petshop } = await supabase.from("petshops").select("slug").eq("id", petshopId).maybeSingle();
    const linkAgendar = petshop?.slug ? `${await appUrl()}/agendar/${petshop.slug}` : "";
    avisados = true;
    after(async () => {
      await notificarDiaCancelado(petshopId, ids, motivo, linkAgendar);
    });
  }

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/hoje");
  return { success: true, cancelados: ids.length, avisados };
}
