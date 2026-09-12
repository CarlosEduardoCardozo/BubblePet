"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { AGENDAMENTO_STATUSES, type AgendamentoStatus } from "@/lib/agendamento";
import { mensagemErroBanco } from "@/lib/db-errors";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp";
import { templateLembrete } from "@/lib/whatsapp-templates";

type ActionResult = { error: string } | { success: true };

const agendamentoFields = z.object({
  pet_id: z.string().trim().min(1, "Selecione o pet"),
  servico_id: z.string().trim().min(1, "Selecione o serviço"),
  inicio: z.string().trim().min(1, "Selecione o horário"),
  observacoes: z.string().trim(),
});

export async function createAgendamento(formData: FormData): Promise<ActionResult> {
  const parsed = agendamentoFields.safeParse({
    pet_id: formData.get("pet_id"),
    servico_id: formData.get("servico_id"),
    inicio: formData.get("inicio"),
    observacoes: formData.get("observacoes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const inicio = new Date(parsed.data.inicio);
  if (Number.isNaN(inicio.getTime())) {
    return { error: "Horário inválido" };
  }

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  // A duração e o preço vêm sempre do serviço no banco — nunca confiamos num
  // "fim" ou valor calculado no cliente. O preço fica congelado no
  // agendamento pra o fechamento do mês não mudar se o serviço for editado.
  const { data: servico, error: servicoError } = await supabase
    .from("servicos")
    .select("duracao_min, preco_centavos")
    .eq("id", parsed.data.servico_id)
    .single();
  if (servicoError || !servico) {
    return { error: "Serviço não encontrado" };
  }

  const fim = new Date(inicio.getTime() + servico.duracao_min * 60_000);

  // MVP não modela recursos/funcionários em paralelo: um agendamento por
  // petshop e por horário. A constraint de exclusão no banco é a garantia
  // final; essa checagem só dá a mensagem antes.
  const { data: conflitos, error: conflitoError } = await supabase
    .from("agendamentos")
    .select("id")
    .eq("petshop_id", petshopId)
    .neq("status", "cancelado")
    .lt("inicio", fim.toISOString())
    .gt("fim", inicio.toISOString());
  if (conflitoError) return { error: mensagemErroBanco(conflitoError) };
  if (conflitos && conflitos.length > 0) {
    return { error: "Já existe um agendamento nesse horário." };
  }

  const { error } = await supabase.from("agendamentos").insert({
    petshop_id: petshopId,
    pet_id: parsed.data.pet_id,
    servico_id: parsed.data.servico_id,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    observacoes: parsed.data.observacoes || null,
    valor_centavos: servico.preco_centavos,
  });
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function createAgendamentoComPlano(
  formData: FormData
): Promise<ActionResult> {
  const parsed = agendamentoFields.safeParse({
    pet_id: formData.get("pet_id"),
    servico_id: formData.get("servico_id"),
    inicio: formData.get("inicio"),
    observacoes: formData.get("observacoes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const inicio = new Date(parsed.data.inicio);
  if (Number.isNaN(inicio.getTime())) {
    return { error: "Horário inválido" };
  }

  const supabase = await createClient();
  // Toda a validação (plano ativo, saldo, conflito) e a escrita do consumo
  // acontecem dentro da function — mesma regra pra qualquer chamador, não só
  // o app.
  const { error } = await supabase.rpc("agendar_com_plano", {
    p_pet_id: parsed.data.pet_id,
    p_servico_id: parsed.data.servico_id,
    p_inicio: inicio.toISOString(),
    p_observacoes: parsed.data.observacoes || null,
  });
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateAgendamentoStatus(
  id: string,
  status: AgendamentoStatus
): Promise<ActionResult> {
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

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export async function enviarLembrete(agendamentoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const [{ data: ag }, { data: petshop }] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, inicio, pets(nome, tutores(id, nome, telefone)), servicos(nome)")
      .eq("id", agendamentoId)
      .single(),
    supabase.from("petshops").select("nome").eq("id", petshopId).single(),
  ]);

  const pet = um(ag?.pets as Um<{ nome: string; tutores: Um<{ id: string; nome: string; telefone: string }> }>);
  const tutor = um(pet?.tutores);
  const servico = um(ag?.servicos as Um<{ nome: string }>);
  if (!ag || !pet || !tutor || !servico || !petshop) {
    return { error: "Agendamento não encontrado." };
  }

  const resultado = await enviarMensagemWhatsapp({
    petshopId,
    tutorId: tutor.id,
    numeroE164: tutor.telefone,
    tipo: "lembrete",
    texto: templateLembrete({
      petshopNome: petshop.nome,
      tutorNome: tutor.nome,
      petNome: pet.nome,
      servicoNome: servico.nome,
      inicioISO: ag.inicio,
    }),
  });
  return resultado.ok ? { success: true } : { error: resultado.erro };
}
