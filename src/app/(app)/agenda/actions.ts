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
import { notificarAgendamento } from "@/lib/agenda/notificar";
import { lerAdicionais, type Adicional } from "@/lib/adicionais";
import { precoParaPorte } from "@/lib/servico-preco";
import { normalizePhoneBR } from "@/lib/phone";
import { DateTime } from "luxon";
import { ZONE } from "@/lib/agenda/slots";

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
 * Duração e preço do serviço pro porte do pet. Sempre do banco — nunca
 * confiamos num "fim" ou valor calculado no cliente. O preço fica congelado
 * no agendamento pra o fechamento não mudar se o serviço for editado.
 */
async function servicoParaPet(
  supabase: SupabaseClient,
  servicoId: string,
  petId: string
): Promise<{ duracaoMin: number; precoCentavos: number } | null> {
  const [{ data: servico }, { data: pet }] = await Promise.all([
    supabase
      .from("servicos")
      .select("duracao_min, preco_centavos, preco_pequeno_centavos, preco_medio_centavos, preco_grande_centavos")
      .eq("id", servicoId)
      .maybeSingle(),
    supabase.from("pets").select("porte").eq("id", petId).maybeSingle(),
  ]);
  if (!servico) return null;
  return { duracaoMin: servico.duracao_min, precoCentavos: precoParaPorte(servico, pet?.porte) };
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
  return { dados: parsed.data, inicio, adicionais: extras.adicionais } as const;
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
  const { dados, inicio, adicionais } = form;
  const datas = datasDaSerie(inicio, formData);
  if ("error" in datas) return datas;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const servico = await servicoParaPet(supabase, dados.servico_id, dados.pet_id);
  if (!servico) return { error: "Serviço não encontrado" };

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
      });
      if (!error && agId) {
        id = agId as string;
        const extras: Record<string, unknown> = {};
        // O plano cobre o banho; os extras são cobrados à parte no fechamento.
        if (adicionais.length > 0) extras.adicionais = adicionais;
        if (recorrenciaId) extras.recorrencia_id = recorrenciaId;
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
      const fim = new Date(data.getTime() + servico.duracaoMin * 60_000);
      const { data: criado, error } = await supabase
        .from("agendamentos")
        .insert({
          petshop_id: petshopId,
          pet_id: dados.pet_id,
          servico_id: dados.servico_id,
          inicio: data.toISOString(),
          fim: fim.toISOString(),
          observacoes: dados.observacoes || null,
          valor_centavos: servico.precoCentavos,
          adicionais,
          recorrencia_id: recorrenciaId,
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
 * Edita horário, serviço, observações e adicionais. Agendamento pago com
 * plano só muda de horário (o crédito está amarrado ao serviço do plano). A
 * duração e o preço sempre vêm do serviço no banco, pelo porte do pet.
 */
export async function updateAgendamento(
  id: string,
  dados: { inicio: string; servicoId: string; observacoes: string; adicionais?: Adicional[] }
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

  const supabase = await createClient();

  const { data: atual } = await supabase
    .from("agendamentos")
    .select("id, pet_id, servico_id, origem_plano, status, valor_centavos")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { error: "Agendamento não encontrado." };
  if (atual.status === "concluido" || atual.status === "cancelado") {
    return { error: "Agendamento encerrado não pode ser alterado." };
  }
  if (atual.origem_plano && dados.servicoId !== atual.servico_id) {
    return { error: "Esse atendimento usa crédito do plano — dá pra mudar o horário, não o serviço." };
  }

  const servico = await servicoParaPet(supabase, dados.servicoId, atual.pet_id);
  if (!servico) return { error: "Serviço não encontrado" };

  const fim = new Date(inicio.getTime() + servico.duracaoMin * 60_000);

  // Mesmo serviço: mantém o preço combinado na hora de marcar.
  const mesmoServico = dados.servicoId === atual.servico_id;
  const { error } = await supabase
    .from("agendamentos")
    .update({
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      servico_id: dados.servicoId,
      observacoes: dados.observacoes.trim() || null,
      valor_centavos: atual.origem_plano
        ? 0
        : mesmoServico && atual.valor_centavos != null
          ? atual.valor_centavos
          : servico.precoCentavos,
      ...(adicionais !== undefined ? { adicionais } : {}),
    })
    .eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
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
    .select("id, status, fechamentos(status, enviado_em)")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { error: "Agendamento não encontrado." };
  if (atual.status === "cancelado") return { error: "Agendamento cancelado não recebe adicionais." };
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
