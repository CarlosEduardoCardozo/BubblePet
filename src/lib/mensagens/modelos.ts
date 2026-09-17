/**
 * Modelos das mensagens de WhatsApp que cada petshop pode reescrever.
 * O texto usa variáveis entre chaves ({tutor}, {pet}...) preenchidas na hora
 * do envio. Puro: roda no servidor (envio) e no navegador (pré-visualização).
 */

export type TipoModelo =
  | "confirmacao"
  | "lembrete"
  | "resposta_confirmado"
  | "resposta_cancelado"
  | "fechamento";

export type Variavel = { chave: string; descricao: string; exemplo: string };

export type DefinicaoModelo = {
  titulo: string;
  quando: string;
  variaveis: Variavel[];
  padrao: string;
  /** Variáveis sem as quais a mensagem perde o sentido. */
  obrigatorias: string[];
};

const V = {
  saudacao: { chave: "saudacao", descricao: "Bom dia / Boa tarde / Boa noite", exemplo: "Boa tarde" },
  tutor: { chave: "tutor", descricao: "Primeiro nome do cliente", exemplo: "Henrique" },
  petshop: { chave: "petshop", descricao: "Nome do petshop", exemplo: "PetShop Araquari" },
  pet: { chave: "pet", descricao: "Nome do pet", exemplo: "Jade" },
  servico: { chave: "servico", descricao: "Serviço agendado", exemplo: "Banho" },
  data: { chave: "data", descricao: "Data (dd/mm)", exemplo: "22/09" },
  dia_semana: { chave: "dia_semana", descricao: "Dia da semana", exemplo: "terça-feira" },
  hora: { chave: "hora", descricao: "Horário", exemplo: "09:00" },
  endereco: { chave: "endereco", descricao: "Endereço do petshop", exemplo: "Rua das Flores, 120" },
} satisfies Record<string, Variavel>;

export const MODELOS: Record<TipoModelo, DefinicaoModelo> = {
  confirmacao: {
    titulo: "Confirmação de agendamento",
    quando: "Ao marcar um horário (agenda com \"Avisar o tutor\" ou link de agendamento). Vai com os botões Confirmar e Cancelar.",
    variaveis: [
      V.saudacao, V.tutor, V.petshop, V.pet, V.servico, V.data, V.dia_semana, V.hora,
      { chave: "valor", descricao: "Valor ou \"coberto pelo plano\"", exemplo: "Valor: *R$ 55,00*." },
      { chave: "adicionais", descricao: "Extras do atendimento (some se não tiver)", exemplo: "• + Desembolo: R$ 15,00" },
      V.endereco,
    ],
    padrao:
      "Oi, {tutor}! 🐾\n\nAgendamento em *{petshop}*:\n\n• Pet: *{pet}*\n• Serviço: {servico}\n{adicionais}\n• {dia_semana}, {data} às *{hora}*\n\n{valor}\n\nPode confirmar se vem?",
    obrigatorias: ["data", "hora"],
  },
  lembrete: {
    titulo: "Lembrete",
    quando: "Pelo botão \"Enviar lembrete\" no agendamento. Também vai com Confirmar e Cancelar.",
    variaveis: [V.saudacao, V.tutor, V.petshop, V.pet, V.servico, V.data, V.dia_semana, V.hora, V.endereco],
    padrao:
      "Oi, {tutor}! 🐾\n\nLembrete de *{petshop}*: o *{pet}* tem *{servico}* {dia_semana}, {data} às *{hora}*.\n\nPode confirmar se vem?",
    obrigatorias: ["data", "hora"],
  },
  resposta_confirmado: {
    titulo: "Resposta: confirmou",
    quando: "Quando o cliente toca em Confirmar (ou responde 1).",
    variaveis: [V.tutor, V.petshop, V.pet, V.data, V.dia_semana, V.hora, V.endereco],
    padrao: "Confirmado! ✅ Esperamos o *{pet}* dia {data} às {hora}. Até lá! 🐾",
    obrigatorias: [],
  },
  resposta_cancelado: {
    titulo: "Resposta: cancelou",
    quando: "Quando o cliente toca em Cancelar (ou responde 2). O horário é liberado na agenda.",
    variaveis: [
      V.tutor, V.petshop, V.pet, V.data, V.dia_semana, V.hora,
      { chave: "link_agendar", descricao: "Link pra marcar outro horário", exemplo: "https://bubblepets.vercel.app/agendar/petshop" },
    ],
    padrao:
      "Tudo bem, cancelamos o horário do *{pet}* de {data} às {hora}.\n\nPra marcar outro horário: {link_agendar}",
    obrigatorias: [],
  },
  fechamento: {
    titulo: "Fechamento do mês",
    quando: "No envio do fechamento pelo Financeiro. O PDF do extrato vai logo depois.",
    variaveis: [
      V.saudacao, V.tutor, V.petshop,
      {
        chave: "detalhes",
        descricao: "Pets, plano, datas dos banhos e valores (montado automaticamente)",
        exemplo:
          "*Jade*\n📋 *Plano Básico* — mensalidade: R$ 120,00\nBanhos do plano (4 de 4):\n• 01/09 (ter)\n• 08/09 (ter)\n• 15/09 (ter)\n• 22/09 (ter)\nBanho a mais, fora do plano:\n• 29/09 (ter) — R$ 55,00",
      },
      { chave: "resumo", descricao: "Quantos banhos e adicionais", exemplo: "Foram 5 banhos: 4 pelo plano e 1 a mais" },
      { chave: "total", descricao: "Valor total", exemplo: "R$ 175,00" },
      { chave: "pix", descricao: "Chave Pix (some se não tiver)", exemplo: "💳 Pix: 12.345.678/0001-90" },
      { chave: "periodo", descricao: "Primeira e última data", exemplo: "01/09 a 29/09" },
    ],
    padrao:
      "{saudacao}, {tutor}! 🐾\n\nSegue o fechamento de *{petshop}*:\n\n{detalhes}\n\n{resumo}\n*Total: {total}*\n\n{pix}\n\nO extrato em PDF vai logo abaixo. Obrigado pela confiança! 💚",
    obrigatorias: ["total"],
  },
};

export const TIPOS_MODELO = Object.keys(MODELOS) as TipoModelo[];

const LIMITE = 2000;

/** Texto do petshop pra esse tipo, ou o padrão. */
export function textoDoModelo(tipo: TipoModelo, personalizados: unknown): string {
  const lista = personalizados && typeof personalizados === "object" ? (personalizados as Record<string, unknown>) : {};
  const texto = lista[tipo];
  return typeof texto === "string" && texto.trim() ? texto : MODELOS[tipo].padrao;
}

/**
 * Troca {variavel} pelo valor. Linha que só tinha variáveis vazias some
 * (ex.: {adicionais} sem extra, {pix} sem chave). Variável desconhecida fica
 * como está, pra quem escreveu perceber o erro na pré-visualização.
 */
export function renderizarModelo(texto: string, valores: Record<string, string | null | undefined>): string {
  const linhas: string[] = [];
  for (const linha of texto.split("\n")) {
    let tinhaVariavel = false;
    const nova = linha.replace(/\{([a-z_]+)\}/g, (inteiro, chave: string) => {
      if (!(chave in valores)) return inteiro;
      tinhaVariavel = true;
      return valores[chave] ?? "";
    });
    if (tinhaVariavel && !nova.trim()) continue;
    linhas.push(nova);
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function valoresDeExemplo(tipo: TipoModelo): Record<string, string> {
  return Object.fromEntries(MODELOS[tipo].variaveis.map((v) => [v.chave, v.exemplo]));
}

/** Valida um texto antes de salvar. */
export function validarModelo(tipo: TipoModelo, texto: string): string | null {
  if (texto.length > LIMITE) return `A mensagem passou de ${LIMITE} caracteres.`;
  const conhecidas = new Set(MODELOS[tipo].variaveis.map((v) => v.chave));
  for (const [, chave] of texto.matchAll(/\{([a-z_]+)\}/g)) {
    if (!conhecidas.has(chave)) return `A variável {${chave}} não existe nessa mensagem.`;
  }
  for (const chave of MODELOS[tipo].obrigatorias) {
    if (!texto.includes(`{${chave}}`)) return `Inclua {${chave}} — sem isso o cliente não entende a mensagem.`;
  }
  return null;
}
