import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { botoesConfirmacao, enviarMensagemWhatsapp, type ResultadoEnvio } from "@/lib/whatsapp";
import { RODAPE_BOTOES, templateConfirmacao, templateLembrete } from "@/lib/whatsapp-templates";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/**
 * Manda pro tutor a confirmação (ao marcar) ou o lembrete de um agendamento,
 * com os botões Confirmar / Cancelar. Usa o client admin filtrando pelo
 * petshop — roda também dentro de `after()`, depois da resposta.
 */
export async function notificarAgendamento(
  petshopId: string,
  agendamentoId: string,
  tipo: "confirmacao" | "lembrete"
): Promise<ResultadoEnvio> {
  const admin = createAdminClient();
  const [{ data: ag }, { data: petshop }] = await Promise.all([
    admin
      .from("agendamentos")
      .select(
        "id, inicio, status, origem_plano, valor_centavos, pets(nome, tutores(id, nome, telefone)), servicos(nome), assinaturas(planos(nome))"
      )
      .eq("id", agendamentoId)
      .eq("petshop_id", petshopId)
      .maybeSingle(),
    admin.from("petshops").select("nome").eq("id", petshopId).maybeSingle(),
  ]);

  const pet = um(ag?.pets as Um<{ nome: string; tutores: Um<{ id: string; nome: string; telefone: string }> }>);
  const tutor = um(pet?.tutores);
  const servico = um(ag?.servicos as Um<{ nome: string }>);
  const plano = um(um(ag?.assinaturas as Um<{ planos: Um<{ nome: string }> }>)?.planos);
  if (!ag || !pet || !tutor || !servico || !petshop) {
    return { ok: false, erro: "Agendamento não encontrado." };
  }

  const texto =
    tipo === "lembrete"
      ? templateLembrete({
          petshopNome: petshop.nome,
          tutorNome: tutor.nome,
          petNome: pet.nome,
          servicoNome: servico.nome,
          inicioISO: ag.inicio,
        })
      : templateConfirmacao({
          petshopNome: petshop.nome,
          tutorNome: tutor.nome,
          petNome: pet.nome,
          servicoNome: servico.nome,
          inicioISO: ag.inicio,
          valorCentavos: ag.valor_centavos ?? 0,
          planoNome: ag.origem_plano ? (plano?.nome ?? "plano") : null,
        });

  return enviarMensagemWhatsapp({
    petshopId,
    tutorId: tutor.id,
    numeroE164: tutor.telefone,
    tipo,
    texto,
    botoes: botoesConfirmacao(ag.id),
    rodape: RODAPE_BOTOES,
  });
}
