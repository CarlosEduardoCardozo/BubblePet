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
 * petshop — roda também dentro de `after()`, depois da resposta, então toda
 * falha vai pro log do servidor (ninguém vê um toast nesse caso).
 */
export async function notificarAgendamento(
  petshopId: string,
  agendamentoId: string,
  tipo: "confirmacao" | "lembrete"
): Promise<ResultadoEnvio> {
  const admin = createAdminClient();
  const [{ data: ag, error }, { data: petshop }] = await Promise.all([
    admin
      .from("agendamentos")
      .select(
        "id, inicio, status, origem_plano, valor_centavos, assinatura_id, pets(nome, tutores(id, nome, telefone)), servicos(nome)"
      )
      .eq("id", agendamentoId)
      .eq("petshop_id", petshopId)
      .maybeSingle(),
    admin.from("petshops").select("nome").eq("id", petshopId).maybeSingle(),
  ]);

  const pet = um(ag?.pets as Um<{ nome: string; tutores: Um<{ id: string; nome: string; telefone: string }> }>);
  const tutor = um(pet?.tutores);
  const servico = um(ag?.servicos as Um<{ nome: string }>);
  if (error || !ag || !pet || !tutor || !servico || !petshop) {
    console.error("notificarAgendamento: não foi possível montar a mensagem", {
      agendamentoId,
      tipo,
      error,
    });
    return { ok: false, erro: "Não foi possível montar a mensagem desse agendamento." };
  }

  // Nome do plano numa consulta à parte: se falhar, a mensagem sai mesmo
  // assim ("coberto pelo plano").
  let planoNome: string | null = null;
  if (ag.origem_plano && ag.assinatura_id) {
    const { data: assinatura } = await admin
      .from("assinaturas")
      .select("planos(nome)")
      .eq("id", ag.assinatura_id)
      .maybeSingle();
    planoNome = um(assinatura?.planos as Um<{ nome: string }>)?.nome ?? null;
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
          planoNome: ag.origem_plano ? (planoNome ?? "plano") : null,
        });

  const resultado = await enviarMensagemWhatsapp({
    petshopId,
    tutorId: tutor.id,
    numeroE164: tutor.telefone,
    tipo,
    texto,
    botoes: botoesConfirmacao(ag.id),
    rodape: RODAPE_BOTOES,
  });
  if (!resultado.ok) {
    console.error("notificarAgendamento: envio falhou", { agendamentoId, tipo, erro: resultado.erro });
  }
  return resultado;
}
