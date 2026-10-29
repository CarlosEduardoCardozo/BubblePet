"use server";

import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularHorariosLivres } from "@/lib/agenda/slots";
import { getSessaoTutor } from "@/lib/publico/session";
import { ocupadosNoDia, petshopPorSlug } from "@/lib/publico/dal";
import { ANTECEDENCIA_ALTERAR_HORAS } from "@/lib/publico/area";

type Resultado = { ok: true } | { ok: false; erro: string };
const ZONE = "America/Sao_Paulo";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/** Atendimento futuro do tutor da sessão (posse conferida no servidor). */
async function atendimentoDoTutor(slug: string, id: string) {
  const sessao = await getSessaoTutor(slug);
  const petshop = await petshopPorSlug(slug);
  if (!sessao || !petshop || sessao.petshopId !== petshop.id) {
    return { erro: "Sua sessão expirou. Confirme o celular de novo." } as const;
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("agendamentos")
    .select("id, inicio, fim, status, origem_plano, servicos(duracao_min), pets!inner(tutor_id)")
    .eq("id", id)
    .eq("petshop_id", petshop.id)
    .eq("pets.tutor_id", sessao.tutorId)
    .maybeSingle();
  if (!data || !["agendado", "confirmado"].includes(data.status)) {
    return { erro: "Atendimento não encontrado." } as const;
  }
  const limite = DateTime.now().plus({ hours: ANTECEDENCIA_ALTERAR_HORAS });
  if (DateTime.fromISO(data.inicio) < limite) {
    return {
      erro: `Só dá para alterar até ${ANTECEDENCIA_ALTERAR_HORAS} horas antes. Fale com o petshop.`,
    } as const;
  }
  return { admin, petshop, atendimento: data, duracaoMin: um(data.servicos as Um<{ duracao_min: number }>)?.duracao_min ?? 60 };
}

export async function cancelarPeloTutor(slug: string, id: string): Promise<Resultado> {
  const r = await atendimentoDoTutor(slug, id);
  if ("erro" in r) return { ok: false, erro: String(r.erro) };
  // O crédito do plano volta sozinho (gatilho de cancelamento no banco).
  const { error } = await r.admin.from("agendamentos").update({ status: "cancelado" }).eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível cancelar. Tente de novo." };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function horariosParaRemarcar(slug: string, id: string, dataISO: string): Promise<string[]> {
  const r = await atendimentoDoTutor(slug, id);
  if ("erro" in r) return [];
  const ocupados = await ocupadosNoDia(r.petshop.id, dataISO, id);
  return calcularHorariosLivres({
    dataISO,
    duracaoMin: r.duracaoMin,
    ocupados,
    horario: r.petshop.horario,
  }).map((dt) => dt.toFormat("HH:mm"));
}

export async function remarcarPeloTutor(slug: string, id: string, dataISO: string, hora: string): Promise<Resultado> {
  const r = await atendimentoDoTutor(slug, id);
  if ("erro" in r) return { ok: false, erro: String(r.erro) };

  const novo = DateTime.fromISO(`${dataISO}T${hora}`, { zone: ZONE });
  if (!novo.isValid) return { ok: false, erro: "Data ou horário inválido." };

  // O crédito do plano é do mês do atendimento: não dá para levar para outro mês sozinho.
  if (r.atendimento.origem_plano && !novo.hasSame(DateTime.fromISO(r.atendimento.inicio).setZone(ZONE), "month")) {
    return { ok: false, erro: "Esse banho usa o plano do mês. Escolha um dia no mesmo mês ou fale com o petshop." };
  }

  const ocupados = await ocupadosNoDia(r.petshop.id, dataISO, id);
  const livres = calcularHorariosLivres({ dataISO, duracaoMin: r.duracaoMin, ocupados, horario: r.petshop.horario });
  if (!livres.some((dt) => dt.toMillis() === novo.toMillis())) {
    return { ok: false, erro: "Esse horário acabou de ser ocupado. Escolha outro." };
  }

  const { error } = await r.admin
    .from("agendamentos")
    .update({
      inicio: novo.toUTC().toISO(),
      fim: novo.plus({ minutes: r.duracaoMin }).toUTC().toISO(),
      // Volta a "agendado": o lembrete confirma de novo.
      status: "agendado",
    })
    .eq("id", id);
  if (error) {
    return { ok: false, erro: error.code === "23P01" ? "Esse horário acabou de ser ocupado. Escolha outro." : "Não foi possível remarcar." };
  }
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { ok: true };
}
