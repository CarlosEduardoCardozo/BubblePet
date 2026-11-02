/**
 * Link de agendamento grátis — partes que rodam no servidor e no navegador:
 * tipos, serviços sugeridos, textos das mensagens e o link do wa.me.
 */

export type ServicoGratis = { nome: string; preco_centavos: number | null };
export type Turno = "manha" | "tarde";

export const TURNOS: { valor: Turno; label: string; detalhe: string }[] = [
  { valor: "manha", label: "Manhã", detalhe: "até 12h" },
  { valor: "tarde", label: "Tarde", detalhe: "depois das 12h" },
];

/** Sugestões que aparecem já marcadas no formulário da landing. */
export const SERVICOS_SUGERIDOS = ["Banho", "Banho e tosa", "Tosa higiênica", "Hidratação"];

export const MAX_SERVICOS = 12;

/** Quantos dias à frente o tutor pode pedir. */
export const DIAS_A_FRENTE = 14;

export function formatarPreco(centavos: number | null): string {
  if (centavos == null) return "A combinar";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "45", "45,90", "R$ 45,90" → 4590. Vazio ou inválido → null. */
export function lerPreco(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!limpo) return null;
  const valor = Number(limpo);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 100_000) return null;
  return Math.round(valor * 100);
}

/** wa.me aceita só dígitos, com código do país. */
export function linkWhatsapp(numeroE164: string, texto?: string): string {
  const numero = numeroE164.replace(/\D/g, "");
  return texto ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : `https://wa.me/${numero}`;
}

export type DadosPedido = {
  tutorNome: string;
  tutorTelefone: string;
  petNome: string;
  servico: string;
  diaRotulo: string; // "sexta, 14/11"
  turno: Turno;
  observacao?: string | null;
};

const rotuloTurno = (t: Turno) => (t === "manha" ? "de manhã" : "à tarde");

/** O que o tutor manda, se quiser, pelo próprio WhatsApp. */
export function mensagemDoTutor(petshop: string, p: DadosPedido): string {
  return [
    `Olá, ${petshop}! 🐾`,
    `Quero agendar *${p.servico}* para o *${p.petNome}* na *${p.diaRotulo}*, ${rotuloTurno(p.turno)}.`,
    p.observacao ? `Obs.: ${p.observacao}` : null,
    `Meu nome é ${p.tutorNome}. Fiz o pedido pelo link de agendamento.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Aviso que o BubblePet manda pro petshop a cada pedido. */
export function mensagemParaPetshop(p: DadosPedido & { telefoneFormatado: string }): string {
  return [
    `🐾 *Novo pedido de agendamento*`,
    ``,
    `*Pet:* ${p.petNome}`,
    `*Serviço:* ${p.servico}`,
    `*Quando:* ${p.diaRotulo}, ${rotuloTurno(p.turno)}`,
    `*Tutor:* ${p.tutorNome} · ${p.telefoneFormatado}`,
    p.observacao ? `*Obs.:* ${p.observacao}` : null,
    ``,
    `Responda o tutor pelo WhatsApp dele: ${linkWhatsapp(p.tutorTelefone)}`,
    ``,
    `_Todos os pedidos ficam na sua página de pedidos (o link que enviamos quando você criou sua página)._`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function mensagemBoasVindas(p: { nomeDono: string; linkPublico: string; linkGestao: string }): string {
  return [
    `Oi, ${p.nomeDono}! Seu link de agendamento grátis do BubblePet está no ar 🎉`,
    ``,
    `🔗 *Link pros seus clientes:*`,
    p.linkPublico,
    `Coloque na bio do Instagram e mande no WhatsApp. Cada pedido chega aqui nesta conversa.`,
    ``,
    `🔒 *Sua página de pedidos (não compartilhe):*`,
    p.linkGestao,
  ].join("\n");
}
