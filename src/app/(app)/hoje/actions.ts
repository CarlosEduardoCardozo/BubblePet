"use server";

import { revalidatePath } from "next/cache";
import { semPermissao } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp";
import { templatePetPronto } from "@/lib/whatsapp-templates";
import { lerEtapa, type Etapa } from "@/lib/painel-dia";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export type ResultadoEtapa =
  | { error: string }
  | { success: true; aviso: "enviado" | "ja_avisado" | "whatsapp_off" | "nao_avisar" | null; erroAviso?: string };

/**
 * Leva o atendimento pra uma etapa (null = volta pra "Aguardando").
 * Pronto → manda o "pode buscar" (uma vez só). Entregue → concluído.
 */
export async function mudarEtapa(id: string, etapaRaw: Etapa | null, avisarTutor: boolean): Promise<ResultadoEtapa> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const etapa = etapaRaw === null ? null : lerEtapa(etapaRaw);
  if (etapaRaw !== null && !etapa) return { error: "Etapa inválida." };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data: ag, error: erroAg } = await supabase
    .from("agendamentos")
    .select("id, status, pronto_avisado_em, pets(nome, tutores(id, nome, telefone)), servicos(nome)")
    .eq("id", id)
    .maybeSingle();
  if (erroAg || !ag) return { error: "Atendimento não encontrado." };

  const mudanca: Record<string, unknown> = { etapa, etapa_em: etapa ? new Date().toISOString() : null };
  if (etapa === "entregue") mudanca.status = "concluido";
  // Voltou de "entregue": deixa de contar como concluído.
  else if (ag.status === "concluido") mudanca.status = "confirmado";
  // Quem chegou está confirmado na prática.
  if (etapa && ag.status === "agendado") mudanca.status = "confirmado";

  const { error } = await supabase.from("agendamentos").update(mudanca).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };

  let aviso: "enviado" | "ja_avisado" | "whatsapp_off" | "nao_avisar" | null = null;
  let erroAviso: string | undefined;
  if (etapa === "pronto") {
    if (!avisarTutor) aviso = "nao_avisar";
    else if (ag.pronto_avisado_em) aviso = "ja_avisado";
    else {
      const pet = um(ag.pets as Um<{ nome: string; tutores: Um<{ id: string; nome: string; telefone: string }> }>);
      const tutor = um(pet?.tutores);
      const servico = um(ag.servicos as Um<{ nome: string }>);
      const { data: petshop } = await supabase
        .from("petshops")
        .select("nome, endereco, modelos_mensagem, whatsapp_status")
        .eq("id", petshopId)
        .single();
      if (petshop?.whatsapp_status !== "conectado" || !tutor) aviso = "whatsapp_off";
      else {
        const r = await enviarMensagemWhatsapp({
          petshopId,
          tutorId: tutor.id,
          numeroE164: tutor.telefone,
          tipo: "pet_pronto",
          texto: templatePetPronto({
            petshop: { nome: petshop.nome, endereco: petshop.endereco, modelos: petshop.modelos_mensagem },
            tutorNome: tutor.nome,
            petNome: pet?.nome ?? "seu pet",
            servicoNome: servico?.nome ?? "banho",
          }),
        });
        if (r.ok) {
          aviso = "enviado";
          await supabase.from("agendamentos").update({ pronto_avisado_em: new Date().toISOString() }).eq("id", id);
        } else {
          erroAviso = r.erro;
        }
      }
    }
  }

  revalidatePath("/hoje");
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: true, aviso, erroAviso };
}

/** O tutor não trouxe o pet. */
export async function marcarFaltou(id: string): Promise<{ error: string } | { success: true }> {
  const bloqueio = await semPermissao("agenda");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { error } = await supabase.from("agendamentos").update({ status: "faltou", etapa: null, etapa_em: null }).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };
  revalidatePath("/hoje");
  revalidatePath("/agenda");
  return { success: true };
}
