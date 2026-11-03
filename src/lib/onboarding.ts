/**
 * Primeiros passos do teste grátis: seis missões que levam a pessoa ao
 * "momento de valor" (primeiro agendamento). Cada missão vale 100 pontos e o
 * total vira um nível. Puro: serve ao servidor e à tela.
 */

export type Missao = {
  id: "dados" | "servico" | "cliente" | "agendar" | "whatsapp" | "link";
  titulo: string;
  descricao: string;
  href: string;
  cta: string;
};

export const MISSOES: Missao[] = [
  { id: "dados", titulo: "Complete os dados do petshop", descricao: "Telefone e endereço aparecem nas mensagens que seus clientes recebem.", href: "/configuracoes", cta: "Completar dados" },
  { id: "servico", titulo: "Cadastre seu primeiro serviço", descricao: "Banho, tosa... com preço e duração. É o que vai para a agenda.", href: "/servicos", cta: "Cadastrar serviço" },
  { id: "cliente", titulo: "Cadastre um cliente e o pet", descricao: "Quem é o tutor e qual o nome do bichinho.", href: "/tutores-pets", cta: "Cadastrar cliente" },
  { id: "agendar", titulo: "Faça o primeiro agendamento", descricao: "Marque um horário e veja a agenda ganhar vida.", href: "/agenda", cta: "Abrir a agenda" },
  { id: "whatsapp", titulo: "Conecte o WhatsApp", descricao: "Lembretes e confirmações saem sozinhos, sem você digitar.", href: "/configuracoes", cta: "Conectar WhatsApp" },
  { id: "link", titulo: "Compartilhe seu link de agendamento", descricao: "Seus clientes marcam sozinhos, a qualquer hora.", href: "/configuracoes", cta: "Copiar o link" },
];

export const PONTOS_POR_MISSAO = 100;

export type Nivel = { nome: string; emoji: string; minimo: number };

export const NIVEIS: Nivel[] = [
  { nome: "Filhote", emoji: "🐶", minimo: 0 },
  { nome: "Aprendiz", emoji: "🐕", minimo: 200 },
  { nome: "Banhista", emoji: "🛁", minimo: 400 },
  { nome: "Mestre dos Banhos", emoji: "🏆", minimo: 600 },
];

export function nivelDe(pontos: number): { atual: Nivel; proximo: Nivel | null } {
  let indice = 0;
  NIVEIS.forEach((n, i) => {
    if (pontos >= n.minimo) indice = i;
  });
  return { atual: NIVEIS[indice], proximo: NIVEIS[indice + 1] ?? null };
}

/** O que a função onboarding_status() do banco devolve. */
export type StatusBanco = {
  servicos: number;
  tutores: number;
  pets: number;
  agendamentos: number;
  dados_completos: boolean | null;
  whatsapp_conectado: boolean | null;
};

/** O que fica guardado em petshops.onboarding. */
export type OnboardingSalvo = {
  dispensado_em?: string;
  boas_vindas_em?: string;
  celebrados?: string[];
  link_compartilhado?: boolean;
};

export function missoesFeitas(status: StatusBanco, salvo: OnboardingSalvo): Set<Missao["id"]> {
  const feitas = new Set<Missao["id"]>();
  if (status.dados_completos) feitas.add("dados");
  if (status.servicos > 0) feitas.add("servico");
  if (status.pets > 0 && status.tutores > 0) feitas.add("cliente");
  if (status.agendamentos > 0) feitas.add("agendar");
  if (status.whatsapp_conectado) feitas.add("whatsapp");
  if (salvo.link_compartilhado) feitas.add("link");
  return feitas;
}
