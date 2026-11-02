/** CRM de leads do BubblePet: etapas, origens e textos. Puro (servidor e tela). */

export const ETAPAS = ["novo", "contatado", "teste", "assinante", "perdido"] as const;
export type EtapaLead = (typeof ETAPAS)[number];

export const ORIGENS = ["cadastro", "landing", "manual"] as const;
export type OrigemLead = (typeof ORIGENS)[number];

export const ETAPA_INFO: Record<EtapaLead, { label: string; dica: string; classe: string }> = {
  novo: { label: "Novo", dica: "Ainda sem contato", classe: "bg-sky-100 text-sky-800" },
  contatado: { label: "Contatado", dica: "Já falamos com a pessoa", classe: "bg-violet-100 text-violet-800" },
  teste: { label: "Em teste", dica: "Criou conta e está testando", classe: "bg-amber-100 text-amber-800" },
  assinante: { label: "Assinante", dica: "Virou cliente", classe: "bg-emerald-100 text-emerald-800" },
  perdido: { label: "Perdido", dica: "Não vai seguir", classe: "bg-zinc-200 text-zinc-700" },
};

export const ORIGEM_LABEL: Record<OrigemLead, string> = {
  cadastro: "Teste grátis",
  landing: "Landing page",
  manual: "Manual",
};

export type Lead = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  petshopNome: string | null;
  origem: OrigemLead;
  etapa: EtapaLead;
  observacoes: string | null;
  optout: boolean;
  petshopId: string | null;
  ultimoContatoEm: string | null;
  criadoEm: string;
};

export type EntradaHistorico = {
  id: string;
  tipo: "nota" | "etapa" | "mensagem";
  texto: string;
  criadoEm: string;
};

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
