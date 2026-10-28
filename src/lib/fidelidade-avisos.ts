import "server-only";

import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/app-url";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp";
import { templateFidelidade } from "@/lib/whatsapp-templates";
import { carregarConfig } from "@/lib/retorno/carregar";
import { dentroDaJanela, ZONE } from "@/lib/retorno/calcular";
import { FIDELIDADE_PADRAO, type FidelidadeConfig } from "./fidelidade";
import { carregarCartoes } from "./fidelidade-carregar";

export type ResumoFidelidade = { petshops: number; enviados: number; erros: number };

/**
 * Roda junto com a rotina de retorno (a cada 5 min). Em cada petshop com o
 * programa ligado, avisa no máximo UM cliente que ganhou prêmio, dentro da
 * mesma janela e do mesmo intervalo das mensagens de retorno.
 */
export async function executarAvisosFidelidade(agora: DateTime = DateTime.now().setZone(ZONE)): Promise<ResumoFidelidade> {
  const admin = createAdminClient();
  const resumo: ResumoFidelidade = { petshops: 0, enviados: 0, erros: 0 };

  const { data: configs } = await admin.from("fidelidade_config").select("*").eq("ativo", true).eq("avisar_whatsapp", true);
  for (const linha of configs ?? []) {
    const config = { ...FIDELIDADE_PADRAO, ...linha } as FidelidadeConfig & { petshop_id: string };
    const petshopId = config.petshop_id;
    resumo.petshops++;
    try {
      const [{ data: petshop }, envio] = await Promise.all([
        admin.from("petshops").select("nome, endereco, slug, modelos_mensagem, whatsapp_status").eq("id", petshopId).single(),
        carregarConfig(admin, petshopId),
      ]);
      if (petshop?.whatsapp_status !== "conectado" || !dentroDaJanela(agora, envio)) continue;

      const { data: avisos } = await admin
        .from("fidelidade_avisos")
        .select("tutor_id, premio_numero, criado_em")
        .eq("petshop_id", petshopId)
        .order("criado_em", { ascending: false });
      const ultimo = avisos?.[0];
      if (ultimo && agora.diff(DateTime.fromISO(ultimo.criado_em), "minutes").minutes < envio.intervalo_envio_min) continue;

      const avisado = new Map<string, number>();
      for (const a of avisos ?? []) avisado.set(a.tutor_id, Math.max(avisado.get(a.tutor_id) ?? 0, a.premio_numero));

      const cartoes = await carregarCartoes(admin, petshopId, config);
      const proximo = [...cartoes.values()]
        .filter((c) => c.disponiveis > 0 && c.ganhos > (avisado.get(c.tutorId) ?? 0))
        .sort((a, b) => (a.ultimoCarimbo ?? "").localeCompare(b.ultimoCarimbo ?? ""))[0];
      if (!proximo) continue;

      const { data: tutor } = await admin.from("tutores").select("id, nome, telefone, ativo").eq("id", proximo.tutorId).maybeSingle();
      // Reserva o aviso antes de mandar: a chave única impede mandar duas vezes.
      const { data: reserva, error: erroReserva } = await admin
        .from("fidelidade_avisos")
        .insert({
          petshop_id: petshopId,
          tutor_id: proximo.tutorId,
          premio_numero: proximo.ganhos,
          status: tutor?.ativo && tutor.telefone ? "enviado" : "ignorado",
        })
        .select("id, status")
        .single();
      if (erroReserva || !reserva || reserva.status === "ignorado" || !tutor) continue;

      const r = await enviarMensagemWhatsapp({
        petshopId,
        tutorId: tutor.id,
        numeroE164: tutor.telefone,
        tipo: "fidelidade",
        texto: templateFidelidade({
          petshop: { nome: petshop.nome, endereco: petshop.endereco, modelos: petshop.modelos_mensagem },
          tutorNome: tutor.nome,
          premio: config.premio,
          meta: config.meta,
          linkAgendar: `${await appUrl()}/agendar/${petshop.slug}`,
        }),
      });
      if (r.ok) resumo.enviados++;
      else {
        resumo.erros++;
        await admin.from("fidelidade_avisos").update({ status: "erro", erro: r.erro }).eq("id", reserva.id);
      }
    } catch (error) {
      console.error("Aviso de fidelidade falhou no petshop", petshopId, error);
      resumo.erros++;
    }
  }
  return resumo;
}
