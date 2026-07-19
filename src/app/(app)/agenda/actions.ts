"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { AGENDAMENTO_STATUSES, type AgendamentoStatus } from "@/lib/agendamento";

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

  // A duração vem sempre do serviço no banco — nunca confiamos num "fim"
  // calculado no cliente.
  const { data: servico, error: servicoError } = await supabase
    .from("servicos")
    .select("duracao_min")
    .eq("id", parsed.data.servico_id)
    .single();
  if (servicoError || !servico) {
    return { error: "Serviço não encontrado" };
  }

  const fim = new Date(inicio.getTime() + servico.duracao_min * 60_000);

  // MVP não modela recursos/funcionários em paralelo: um agendamento por
  // petshop e por horário.
  const { data: conflitos, error: conflitoError } = await supabase
    .from("agendamentos")
    .select("id")
    .eq("petshop_id", petshopId)
    .neq("status", "cancelado")
    .lt("inicio", fim.toISOString())
    .gt("fim", inicio.toISOString());
  if (conflitoError) return { error: conflitoError.message };
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
  });
  if (error) return { error: error.message };

  revalidatePath("/agenda");
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
  if (error) return { error: error.message };

  revalidatePath("/agenda");
  return { success: true };
}
