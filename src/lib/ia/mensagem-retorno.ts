import "server-only";

import { gerarJson } from "./openai";

export type DadosMensagemIa = {
  petshopNome: string;
  /** Como o petshop fala com os clientes (configurado em Oportunidades → Regras). */
  tom: string | null;
  tutorPrimeiroNome: string;
  petNome: string;
  tipo: "retorno" | "plano_sobrando";
  servicoNome: string;
  diasDesdeUltima: number | null;
  intervaloDias: number | null;
  visitas: number;
  planoNome?: string;
  saldo?: number;
  linkAgendar: string;
};

const INSTRUCOES = `Você escreve mensagens de WhatsApp de um petshop brasileiro para o tutor de um pet.
Regras:
- Português do Brasil, natural e caloroso, como uma pessoa da recepção escreveria. Nada de tom de propaganda.
- No máximo 400 caracteres. Duas ou três frases curtas, com no máximo 2 emojis.
- Chame o tutor pelo primeiro nome e o pet pelo nome. Use *negrito* do WhatsApp só no nome do pet.
- Termine convidando a marcar o horário pelo link, e escreva o link exatamente como foi dado, uma vez só.
- Nunca invente preço, desconto, promoção, brinde, horário disponível ou qualquer fato que não esteja nos dados.
- Não use "Prezado", "Olá, tudo bem?" genérico nem assinatura.`;

/** Escreve a mensagem de retorno (ou de plano sobrando) com a IA. Lança erro se a IA falhar. */
export async function escreverMensagemIa(d: DadosMensagemIa): Promise<string> {
  const fatos = [
    `Petshop: ${d.petshopNome}`,
    `Tutor: ${d.tutorPrimeiroNome}`,
    `Pet: ${d.petNome}`,
    d.tipo === "plano_sobrando"
      ? `Motivo: o plano "${d.planoNome}" do pet ainda tem ${d.saldo} banho(s) neste mês, e eles não passam para o mês que vem.`
      : `Motivo: está na hora de o pet voltar. Último serviço: ${d.servicoNome.toLowerCase()}, há ${d.diasDesdeUltima} dias.` +
        (d.intervaloDias && d.visitas > 1 ? ` Ele costuma vir a cada ${d.intervaloDias} dias (${d.visitas} visitas).` : ""),
    `Link para agendar: ${d.linkAgendar}`,
    d.tom ? `Tom de voz pedido pelo petshop: ${d.tom}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const r = await gerarJson<{ mensagem: string }>({
    instrucoes: INSTRUCOES,
    texto: fatos,
    nomeSchema: "mensagem_whatsapp",
    schema: {
      type: "object",
      properties: { mensagem: { type: "string", description: "Texto final da mensagem de WhatsApp" } },
      required: ["mensagem"],
      additionalProperties: false,
    },
    temperatura: 0.8,
  });

  const texto = r.mensagem.trim();
  // Garante o link certo, mesmo se a IA tiver mexido nele.
  if (!texto.includes(d.linkAgendar)) return `${texto}\n\n${d.linkAgendar}`;
  return texto;
}
