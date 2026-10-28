"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { semPermissao } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { contaCarimbo, hojeSP, valorComPremio, type Cartao } from "@/lib/fidelidade";
import { cartaoDoTutor } from "@/lib/fidelidade-carregar";

type ActionResult = { error: string } | { success: true };

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

const configSchema = z.object({
  meta: z.coerce.number().int().min(2, "O cartão precisa de pelo menos 2 atendimentos.").max(50, "No máximo 50 atendimentos por cartão."),
  desconto_pct: z.coerce.number().int().min(5, "Desconto mínimo de 5%.").max(100),
  premio: z.string().trim().min(2, "Descreva o prêmio.").max(60, "Descreva o prêmio em até 60 caracteres."),
  servico_ids: z.array(z.string().uuid()).nullable(),
  avisar_whatsapp: z.boolean(),
  contar_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
});

type Numero = number | string;
export type ConfigFidelidadeForm = {
  meta: Numero;
  desconto_pct: Numero;
  premio: string;
  servico_ids: string[] | null;
  avisar_whatsapp: boolean;
  contar_desde: string;
};

function revalidar() {
  revalidatePath("/fidelidade");
  revalidatePath("/agenda");
  revalidatePath("/financeiro");
}

export async function salvarConfigFidelidade(form: ConfigFidelidadeForm): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const parsed = configSchema.safeParse(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const dados = { ...parsed.data, servico_ids: parsed.data.servico_ids?.length ? parsed.data.servico_ids : null };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { error } = await supabase
    .from("fidelidade_config")
    .upsert({ petshop_id: petshopId, ...dados, atualizado_em: new Date().toISOString() });
  if (error) return { error: mensagemErroBanco(error) };
  revalidar();
  return { success: true };
}

export async function alternarFidelidade(ativo: boolean): Promise<ActionResult> {
  const bloqueio = await semPermissao("clientes");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  // Primeira vez: a contagem começa hoje (em São Paulo; o banco está em UTC).
  const { data: existe } = await supabase.from("fidelidade_config").select("petshop_id").eq("petshop_id", petshopId).maybeSingle();
  const { error } = await supabase.from("fidelidade_config").upsert({
    petshop_id: petshopId,
    ativo,
    ...(existe ? {} : { contar_desde: hojeSP() }),
    atualizado_em: new Date().toISOString(),
  });
  if (error) return { error: mensagemErroBanco(error) };
  revalidar();
  return { success: true };
}

export type StatusFidelidade =
  | { ativo: false }
  | {
      ativo: true;
      premio: string;
      descontoPct: number;
      meta: number;
      cartao: Pick<Cartao, "carimbos" | "progresso" | "faltam" | "disponiveis"> | null;
      resgatado: boolean;
      /** Por que não dá pra usar o prêmio aqui (null = dá). */
      bloqueio: string | null;
      valorAtualCentavos: number;
      valorComPremioCentavos: number;
    };

type AgendamentoPremio = {
  id: string;
  inicio: string;
  status: string;
  origem_plano: boolean;
  servico_id: string;
  valor_centavos: number | null;
  fidelidade_resgate: boolean;
  fidelidade_valor_original: number | null;
  pets: unknown;
  servicos: unknown;
  fechamentos: unknown;
};

async function lerAgendamento(id: string) {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data } = await supabase
    .from("agendamentos")
    .select(
      "id, inicio, status, origem_plano, servico_id, valor_centavos, fidelidade_resgate, fidelidade_valor_original, pets(tutor_id), servicos(preco_centavos), fechamentos(status, enviado_em)"
    )
    .eq("id", id)
    .maybeSingle<AgendamentoPremio>();
  if (!data) return null;
  const tutorId = um(data.pets as Um<{ tutor_id: string }>)?.tutor_id;
  if (!tutorId) return null;
  const { config, cartao } = await cartaoDoTutor(supabase, petshopId, tutorId);
  const fechamento = um(data.fechamentos as Um<{ status: string; enviado_em: string | null }>);
  const cobrado = !!fechamento && (fechamento.status === "pago" || !!fechamento.enviado_em);
  const valorAtual = data.valor_centavos ?? um(data.servicos as Um<{ preco_centavos: number }>)?.preco_centavos ?? 0;

  // O atendimento que completa o cartão não pode ser o próprio prêmio.
  const contaEste = contaCarimbo(
    config,
    { tutorId, servicoId: data.servico_id, inicio: data.inicio, status: data.status, origemPlano: data.origem_plano, resgate: false },
    new Date().toISOString()
  );
  const disponiveisAqui = cartao ? Math.floor((cartao.carimbos - (contaEste ? 1 : 0)) / config.meta) - cartao.usados : 0;

  let bloqueio: string | null = null;
  if (cobrado) bloqueio = "Esse atendimento já foi cobrado num extrato enviado.";
  else if (data.status === "cancelado" || data.status === "faltou") bloqueio = "Atendimento cancelado ou com falta.";
  else if (data.origem_plano) bloqueio = "Atendimento coberto pelo plano: o prêmio vale para um atendimento pago.";
  else if (config.servico_ids && !config.servico_ids.includes(data.servico_id)) bloqueio = "Esse serviço não entra no programa de fidelidade.";
  else if (!data.fidelidade_resgate && disponiveisAqui <= 0) {
    bloqueio =
      cartao && cartao.disponiveis > 0
        ? "Foi este atendimento que completou o cartão: o prêmio vale a partir do próximo."
        : "O cliente ainda não tem prêmio disponível.";
  }

  return { supabase, data, config, cartao, bloqueio, valorAtual };
}

export async function statusFidelidadeAgendamento(id: string): Promise<StatusFidelidade | { error: string }> {
  const bloqueioPermissao = await semPermissao("agenda");
  if (bloqueioPermissao) return bloqueioPermissao;
  try {
    const lido = await lerAgendamento(id);
    if (!lido) return { error: "Agendamento não encontrado." };
    const { data, config, cartao, bloqueio, valorAtual } = lido;
    if (!config.ativo) return { ativo: false };
    return {
      ativo: true,
      premio: config.premio,
      descontoPct: config.desconto_pct,
      meta: config.meta,
      cartao: cartao
        ? { carimbos: cartao.carimbos, progresso: cartao.progresso, faltam: cartao.faltam, disponiveis: cartao.disponiveis }
        : null,
      resgatado: data.fidelidade_resgate,
      bloqueio: data.fidelidade_resgate ? null : bloqueio,
      valorAtualCentavos: valorAtual,
      valorComPremioCentavos: valorComPremio(valorAtual, config.desconto_pct),
    };
  } catch {
    return { error: "Não foi possível ler o cartão fidelidade." };
  }
}

export async function usarPremioFidelidade(id: string): Promise<ActionResult> {
  const bloqueioPermissao = await semPermissao("agenda");
  if (bloqueioPermissao) return bloqueioPermissao;
  const lido = await lerAgendamento(id);
  if (!lido) return { error: "Agendamento não encontrado." };
  const { supabase, data, config, bloqueio, valorAtual } = lido;
  if (!config.ativo) return { error: "O programa de fidelidade está desligado." };
  if (data.fidelidade_resgate) return { error: "O prêmio já está aplicado neste atendimento." };
  if (bloqueio) return { error: bloqueio };

  const { error } = await supabase
    .from("agendamentos")
    .update({
      fidelidade_resgate: true,
      fidelidade_valor_original: valorAtual,
      valor_centavos: valorComPremio(valorAtual, config.desconto_pct),
    })
    .eq("id", id)
    .eq("fidelidade_resgate", false);
  if (error) return { error: mensagemErroBanco(error) };
  revalidar();
  return { success: true };
}

export async function desfazerPremioFidelidade(id: string): Promise<ActionResult> {
  const bloqueioPermissao = await semPermissao("agenda");
  if (bloqueioPermissao) return bloqueioPermissao;
  const lido = await lerAgendamento(id);
  if (!lido) return { error: "Agendamento não encontrado." };
  const { supabase, data } = lido;
  if (!data.fidelidade_resgate) return { success: true };
  const fechamento = um(data.fechamentos as Um<{ status: string; enviado_em: string | null }>);
  if (fechamento && (fechamento.status === "pago" || fechamento.enviado_em)) {
    return { error: "Esse atendimento já foi cobrado num extrato enviado." };
  }

  const { error } = await supabase
    .from("agendamentos")
    .update({
      fidelidade_resgate: false,
      fidelidade_valor_original: null,
      valor_centavos: data.fidelidade_valor_original ?? data.valor_centavos,
    })
    .eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };
  revalidar();
  return { success: true };
}
