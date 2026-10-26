import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/app-url";
import { enviarMensagemWhatsapp, type ResultadoEnvio } from "@/lib/whatsapp";
import { templatePlanoSobrando, templateRetorno } from "@/lib/whatsapp-templates";
import { dentroDaJanela, horariosDaFila, ZONE, type PlanoSobrando, type Retorno } from "./calcular";
import { carregarRetornos, type DadosRetorno } from "./carregar";

type PetshopEnvio = { id: string; nome: string; endereco: string | null; modelos_mensagem: unknown; slug: string };

async function lerPetshop(supabase: SupabaseClient, petshopId: string): Promise<PetshopEnvio | null> {
  const { data } = await supabase
    .from("petshops")
    .select("id, nome, endereco, modelos_mensagem, slug")
    .eq("id", petshopId)
    .maybeSingle();
  return (data as PetshopEnvio | null) ?? null;
}

/** Monta o texto e manda pelo WhatsApp do petshop. */
export async function enviarParaPet(
  petshop: PetshopEnvio,
  item: { tipo: "retorno"; retorno: Retorno } | { tipo: "plano_sobrando"; plano: PlanoSobrando }
): Promise<ResultadoEnvio> {
  const link = `${await appUrl()}/agendar/${petshop.slug}`;
  const p = { nome: petshop.nome, endereco: petshop.endereco, modelos: petshop.modelos_mensagem };
  const pet = item.tipo === "retorno" ? item.retorno : item.plano;
  const texto =
    item.tipo === "retorno"
      ? templateRetorno({
          petshop: p,
          tutorNome: pet.tutorNome,
          petNome: pet.petNome,
          servicoNome: item.retorno.servicoNome,
          dias: item.retorno.diasDesdeUltima,
          linkAgendar: link,
        })
      : templatePlanoSobrando({
          petshop: p,
          tutorNome: pet.tutorNome,
          petNome: pet.petNome,
          planoNome: item.plano.planoNome,
          saldo: item.plano.saldo,
          linkAgendar: link,
        });
  return enviarMensagemWhatsapp({
    petshopId: petshop.id,
    tutorId: pet.tutorId,
    numeroE164: pet.telefone,
    tipo: item.tipo,
    texto,
  });
}

/** O pet ainda deve receber essa mensagem agora? (pode ter marcado horário desde a fila) */
function itemValido(dados: DadosRetorno, petId: string, tipo: "retorno" | "plano_sobrando") {
  if (tipo === "plano_sobrando") {
    const plano = dados.planosSobrando.find((p) => p.petId === petId && !p.pausado);
    return plano ? ({ tipo, plano } as const) : null;
  }
  const retorno = dados.retornos.find(
    (r) => r.petId === petId && !r.pausado && (r.categoria === "hora_de_voltar" || r.categoria === "atrasado")
  );
  return retorno ? ({ tipo, retorno } as const) : null;
}

/** Já recebeu (ou vai receber) mensagem nos últimos N dias? */
function mensagemRecente(dados: DadosRetorno, petId: string, agora: DateTime): boolean {
  const m = dados.ultimaMensagem.get(petId);
  if (!m || m.status === "cancelada" || m.status === "erro") return false;
  if (m.status === "pendente") return true;
  const quando = DateTime.fromISO(m.enviadaEm ?? m.agendadaPara);
  return agora.diff(quando, "days").days < dados.config.reenviar_apos_dias;
}

/** Monta a fila do dia: quem precisa de mensagem, espaçado dentro da janela. */
async function planejarDia(admin: SupabaseClient, petshopId: string, dados: DadosRetorno, agora: DateTime) {
  const hoje = agora.toISODate()!;
  // Pendências de dias anteriores que não saíram: não manda atrasado.
  await admin
    .from("mensagens_agendadas")
    .update({ status: "cancelada", erro: "Não saiu no dia previsto" })
    .eq("petshop_id", petshopId)
    .eq("status", "pendente")
    .lt("agendada_para", agora.startOf("day").toUTC().toISO()!);

  const candidatos: { petId: string; tutorId: string; tipo: "retorno" | "plano_sobrando" }[] = [];
  for (const p of dados.planosSobrando) {
    if (!p.pausado) candidatos.push({ petId: p.petId, tutorId: p.tutorId, tipo: "plano_sobrando" });
  }
  // Quem está na hora primeiro, depois os atrasados (do menos ao mais atrasado).
  const retornos = dados.retornos
    .filter((r) => !r.pausado && (r.categoria === "hora_de_voltar" || r.categoria === "atrasado"))
    .sort((a, b) => b.diasParaVoltar - a.diasParaVoltar);
  for (const r of retornos) candidatos.push({ petId: r.petId, tutorId: r.tutorId, tipo: "retorno" });

  const tutores = new Set<string>();
  const escolhidos = candidatos.filter((c) => {
    if (mensagemRecente(dados, c.petId, agora) || tutores.has(c.tutorId)) return false;
    tutores.add(c.tutorId); // uma mensagem por tutor por dia
    return true;
  });

  const horarios = horariosDaFila({ agora, config: dados.config, quantidade: Math.min(escolhidos.length, dados.config.limite_dia) });
  if (horarios.length) {
    await admin.from("mensagens_agendadas").insert(
      horarios.map((h, i) => ({
        petshop_id: petshopId,
        pet_id: escolhidos[i].petId,
        tutor_id: escolhidos[i].tutorId,
        tipo: escolhidos[i].tipo,
        agendada_para: h.toUTC().toISO(),
      }))
    );
  }
  await admin.from("retorno_config").update({ planejado_em: hoje }).eq("petshop_id", petshopId);
  return horarios.length;
}

export type ResumoRotina = { petshops: number; planejadas: number; enviadas: number; canceladas: number; erros: number };

/**
 * Chamada a cada 5 min pelo banco (pg_cron → /api/rotinas/retorno). Em cada
 * petshop com o retorno ligado: monta a fila uma vez por dia e manda no
 * máximo UMA mensagem por chamada, a que já passou do horário.
 */
export async function executarRotinaRetorno(agora: DateTime = DateTime.now().setZone(ZONE)): Promise<ResumoRotina> {
  const admin = createAdminClient();
  const resumo: ResumoRotina = { petshops: 0, planejadas: 0, enviadas: 0, canceladas: 0, erros: 0 };

  const { data: configs } = await admin.from("retorno_config").select("petshop_id").eq("ativo", true);
  for (const { petshop_id: petshopId } of configs ?? []) {
    resumo.petshops++;
    try {
      const dados = await carregarRetornos(admin, petshopId, agora);
      if (!dados.whatsappConectado || !dentroDaJanela(agora, dados.config)) continue;

      if (dados.config.planejado_em !== agora.toISODate()) {
        resumo.planejadas += await planejarDia(admin, petshopId, dados, agora);
      }

      const { data: proxima } = await admin
        .from("mensagens_agendadas")
        .select("id, pet_id, tipo")
        .eq("petshop_id", petshopId)
        .eq("status", "pendente")
        .lte("agendada_para", agora.toUTC().toISO()!)
        .order("agendada_para")
        .limit(1)
        .maybeSingle();
      if (!proxima) continue;

      // Recarrega: o planejamento acima pode ter mudado as mensagens recentes.
      const atual = await carregarRetornos(admin, petshopId, agora);
      const item = itemValido(atual, proxima.pet_id, proxima.tipo);
      if (!item) {
        await admin.from("mensagens_agendadas").update({ status: "cancelada", erro: "Já marcou horário ou saiu da lista" }).eq("id", proxima.id);
        resumo.canceladas++;
        continue;
      }
      const petshop = await lerPetshop(admin, petshopId);
      if (!petshop) continue;
      const r = await enviarParaPet(petshop, item);
      await admin
        .from("mensagens_agendadas")
        .update(r.ok ? { status: "enviada", enviada_em: new Date().toISOString() } : { status: "erro", erro: r.erro })
        .eq("id", proxima.id);
      if (r.ok) resumo.enviadas++;
      else resumo.erros++;
    } catch (error) {
      console.error("Rotina de retorno falhou no petshop", petshopId, error);
      resumo.erros++;
    }
  }
  return resumo;
}

/** Botão "Enviar agora" do painel: manda já e registra na fila como manual. */
export async function enviarAgora(
  supabase: SupabaseClient,
  petshopId: string,
  petId: string,
  tipo: "retorno" | "plano_sobrando"
): Promise<ResultadoEnvio> {
  const dados = await carregarRetornos(supabase, petshopId);
  if (!dados.whatsappConectado) return { ok: false, erro: "WhatsApp desconectado. Conecte em Configurações." };
  const item =
    tipo === "plano_sobrando"
      ? (() => {
          const plano = dados.planosSobrando.find((p) => p.petId === petId);
          return plano ? ({ tipo, plano } as const) : null;
        })()
      : (() => {
          const retorno = dados.retornos.find((r) => r.petId === petId);
          return retorno ? ({ tipo, retorno } as const) : null;
        })();
  if (!item) return { ok: false, erro: "Esse pet não está mais na lista de oportunidades." };
  const petshop = await lerPetshop(supabase, petshopId);
  if (!petshop) return { ok: false, erro: "Petshop não encontrado." };

  const pet = item.tipo === "retorno" ? item.retorno : item.plano;
  const r = await enviarParaPet(petshop, item);
  // A pendência automática desse pet (se tinha) deixa de valer.
  await supabase
    .from("mensagens_agendadas")
    .update({ status: "cancelada", erro: "Enviada manualmente" })
    .eq("petshop_id", petshopId)
    .eq("pet_id", petId)
    .eq("status", "pendente");
  await supabase.from("mensagens_agendadas").insert({
    petshop_id: petshopId,
    pet_id: petId,
    tutor_id: pet.tutorId,
    tipo,
    origem: "manual",
    agendada_para: new Date().toISOString(),
    status: r.ok ? "enviada" : "erro",
    enviada_em: r.ok ? new Date().toISOString() : null,
    erro: r.ok ? null : r.erro,
  });
  return r;
}
