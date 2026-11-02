import "server-only";

import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarAvisosConfig, lembretesDoAgendamento, type AvisosConfig } from "@/lib/avisos";
import { notificarAgendamento } from "./notificar";

const ZONE = "America/Sao_Paulo";
const MAX_POR_EXECUCAO = 30;
/** Não adianta lembrar de um atendimento que está começando. */
const MARGEM_MIN = 20;

export type ResumoLembretes = { enviados: number; erros: number; ignorados: number };

/**
 * Lembretes automáticos. Roda a cada 5 minutos junto com a rotina de retorno:
 * para cada atendimento marcado, vê quais lembretes dele já passaram da hora
 * (ex.: 24 h e 4 h antes) e ainda não saíram, e manda. Cada lembrete sai uma
 * vez só (chave única em agendamento_lembretes), mesmo se duas execuções se
 * cruzarem.
 */
export async function executarLembretes(agora: DateTime = DateTime.now().setZone(ZONE)): Promise<ResumoLembretes> {
  const resumo: ResumoLembretes = { enviados: 0, erros: 0, ignorados: 0 };
  const admin = createAdminClient();

  const { data: ags } = await admin
    .from("agendamentos")
    .select("id, petshop_id, inicio, criado_em, avisos, petshops!inner(whatsapp_status)")
    .in("status", ["agendado", "confirmado"])
    .not("avisos", "is", null)
    .eq("petshops.whatsapp_status", "conectado")
    .gt("inicio", agora.plus({ minutes: MARGEM_MIN }).toUTC().toISO()!)
    .lte("inicio", agora.plus({ hours: 73 }).toUTC().toISO()!)
    .order("inicio")
    .limit(500);
  if (!ags?.length) return resumo;

  const { data: jaTratados } = await admin
    .from("agendamento_lembretes")
    .select("agendamento_id, horas")
    .in("agendamento_id", ags.map((a) => a.id));
  const tratados = new Set((jaTratados ?? []).map((l) => `${l.agendamento_id}:${l.horas}`));

  const configs = new Map<string, AvisosConfig>();
  const configDe = async (petshopId: string) => {
    let c = configs.get(petshopId);
    if (!c) {
      c = await carregarAvisosConfig(admin, petshopId);
      configs.set(petshopId, c);
    }
    return c;
  };

  let enviadosNaRodada = 0;
  for (const ag of ags) {
    const horasDoAgendamento = lembretesDoAgendamento(ag.avisos) ?? [];
    const inicio = DateTime.fromISO(ag.inicio);
    for (const horas of horasDoAgendamento) {
      if (tratados.has(`${ag.id}:${horas}`)) continue;
      const devidoEm = inicio.minus({ hours: horas });
      if (devidoEm > agora) continue;

      const reservar = async (status: "enviado" | "ignorado") =>
        admin.from("agendamento_lembretes").insert({ petshop_id: ag.petshop_id, agendamento_id: ag.id, horas, status });

      // Marcado depois da hora do lembrete: a confirmação já cobriu, não repete.
      if (DateTime.fromISO(ag.criado_em) > devidoEm) {
        await reservar("ignorado");
        resumo.ignorados++;
        continue;
      }

      // Fora da janela de horário (madrugada): espera a próxima rodada dentro dela.
      const config = await configDe(ag.petshop_id);
      const hora = agora.hour;
      if (hora < config.janela_inicio || hora >= config.janela_fim) continue;
      if (enviadosNaRodada >= MAX_POR_EXECUCAO) return resumo;

      const { error } = await reservar("enviado");
      if (error) continue; // outra execução já pegou esse lembrete
      enviadosNaRodada++;

      const r = await notificarAgendamento(ag.petshop_id, ag.id, "lembrete");
      if (r.ok) {
        resumo.enviados++;
      } else {
        resumo.erros++;
        await admin
          .from("agendamento_lembretes")
          .update({ status: "erro", erro: r.erro.slice(0, 300) })
          .eq("agendamento_id", ag.id)
          .eq("horas", horas);
      }
    }
  }
  return resumo;
}
