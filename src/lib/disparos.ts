import "server-only";

import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { ETAPAS, ORIGENS, primeiroNome, type EtapaLead, type OrigemLead } from "@/lib/leads";
import { carregarConfigPlataforma, enviarPelaPlataforma } from "@/lib/plataforma";

const ZONE = "America/Sao_Paulo";
/** Cada rodada (a cada 5 min) manda poucas mensagens, com pausa entre elas: parece gente, não robô. */
const MAX_POR_RODADA = 6;
const JANELA_INICIO = 8;
const JANELA_FIM = 20;

export type FiltroDisparo = { etapas: EtapaLead[]; origens: OrigemLead[] };

/** Troca {nome} (primeiro nome) e {petshop}. Variável desconhecida fica como está. */
export function renderizarDisparo(texto: string, lead: { nome: string; petshopNome: string | null }): string {
  return texto
    .replace(/\{nome\}/g, primeiroNome(lead.nome))
    .replace(/\{petshop\}/g, lead.petshopNome?.trim() || "seu petshop");
}

export function lerFiltro(raw: unknown): FiltroDisparo {
  const f = (raw && typeof raw === "object" ? raw : {}) as { etapas?: unknown; origens?: unknown };
  const etapas = (Array.isArray(f.etapas) ? f.etapas : []).filter((e): e is EtapaLead => ETAPAS.includes(e as EtapaLead));
  const origens = (Array.isArray(f.origens) ? f.origens : []).filter((o): o is OrigemLead => ORIGENS.includes(o as OrigemLead));
  return { etapas, origens };
}

/** Leads que recebem: com WhatsApp, sem pedido de sair, nas etapas e origens escolhidas. */
export async function leadsDoFiltro(filtro: FiltroDisparo) {
  if (filtro.etapas.length === 0 || filtro.origens.length === 0) return [];
  const { data } = await createAdminClient()
    .from("leads")
    .select("id, nome, telefone, petshop_nome")
    .eq("optout", false)
    .not("telefone", "is", null)
    .in("etapa", filtro.etapas)
    .in("origem", filtro.origens)
    .order("criado_em")
    .limit(5000);
  return (data ?? []).map((l) => ({ id: l.id as string, nome: l.nome as string, telefone: l.telefone as string, petshopNome: l.petshop_nome as string | null }));
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ResumoDisparos = { enviados: number; erros: number; ignorados: number };

/**
 * Roda a cada 5 minutos junto com as outras rotinas. Respeita a janela de
 * horário e o teto por hora configurado, manda poucas mensagens por rodada e
 * pula quem pediu para sair. Cada envio é anotado no histórico do lead.
 */
export async function executarDisparos(agora: DateTime = DateTime.now().setZone(ZONE)): Promise<ResumoDisparos> {
  const resumo: ResumoDisparos = { enviados: 0, erros: 0, ignorados: 0 };
  if (agora.hour < JANELA_INICIO || agora.hour >= JANELA_FIM) return resumo;

  const db = createAdminClient();
  const config = await carregarConfigPlataforma();
  if (!config.disparoUrl || !config.disparoToken) return resumo;

  const { count: naUltimaHora } = await db
    .from("disparo_envios")
    .select("id", { count: "exact", head: true })
    .eq("status", "enviado")
    .gte("enviado_em", agora.minus({ hours: 1 }).toUTC().toISO()!);
  const orcamento = Math.min(MAX_POR_RODADA, Math.max(1, Math.floor(config.disparoPorHora / 12)), config.disparoPorHora - (naUltimaHora ?? 0));
  if (orcamento <= 0) return resumo;

  const { data: fila } = await db
    .from("disparo_envios")
    .select("id, disparo_id, lead_id, telefone, disparos!inner(status, nome, texto), leads(nome, petshop_nome, optout)")
    .eq("status", "pendente")
    .eq("disparos.status", "enviando")
    .order("id")
    .limit(orcamento);
  if (!fila?.length) return resumo;

  const tocados = new Set<string>();
  let primeiro = true;
  for (const envio of fila) {
    const disparo = (Array.isArray(envio.disparos) ? envio.disparos[0] : envio.disparos) as { nome: string; texto: string };
    const lead = (Array.isArray(envio.leads) ? envio.leads[0] : envio.leads) as { nome: string; petshop_nome: string | null; optout: boolean } | null;
    tocados.add(envio.disparo_id);

    if (!lead || lead.optout) {
      await db.from("disparo_envios").update({ status: "ignorado", erro: "Pediu para não receber." }).eq("id", envio.id);
      resumo.ignorados++;
      continue;
    }

    if (!primeiro) await dormir(1500 + Math.random() * 2000);
    primeiro = false;

    const r = await enviarPelaPlataforma(envio.telefone, renderizarDisparo(disparo.texto, { nome: lead.nome, petshopNome: lead.petshop_nome }), config);
    if (r.ok) {
      resumo.enviados++;
      const agoraISO = new Date().toISOString();
      await db.from("disparo_envios").update({ status: "enviado", enviado_em: agoraISO }).eq("id", envio.id);
      await db.from("leads").update({ ultimo_contato_em: agoraISO }).eq("id", envio.lead_id);
      await db.from("leads_historico").insert({ lead_id: envio.lead_id, tipo: "mensagem", texto: `Disparo "${disparo.nome}" enviado.` });
    } else {
      resumo.erros++;
      await db.from("disparo_envios").update({ status: "erro", erro: r.erro.slice(0, 300) }).eq("id", envio.id);
      // Token recusado: parar a rodada em vez de falhar o resto da fila.
      if (r.erro.includes("token")) break;
    }
  }

  // Atualiza os totais de cada campanha e encerra a que não tem mais ninguém na fila.
  for (const id of tocados) {
    const contar = async (status: string) =>
      (await db.from("disparo_envios").select("id", { count: "exact", head: true }).eq("disparo_id", id).eq("status", status)).count ?? 0;
    const [enviados, erros, pendentes] = await Promise.all([contar("enviado"), contar("erro"), contar("pendente")]);
    await db
      .from("disparos")
      .update({ enviados, erros, ...(pendentes === 0 ? { status: "concluido", concluido_em: new Date().toISOString() } : {}) })
      .eq("id", id)
      .eq("status", "enviando");
  }
  return resumo;
}
