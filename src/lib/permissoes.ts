/** Áreas do painel que o dono libera por usuário da equipe. */
export type Modulo = "agenda" | "clientes" | "planos" | "servicos" | "financeiro" | "configuracoes";

export const MODULOS: { valor: Modulo; label: string; descricao: string; href: string }[] = [
  { valor: "agenda", label: "Agenda", descricao: "Marcar, remarcar e concluir atendimentos", href: "/agenda" },
  { valor: "clientes", label: "Clientes e pets", descricao: "Cadastro de clientes, pets e plano do pet", href: "/tutores-pets" },
  { valor: "planos", label: "Planos", descricao: "Criar e editar planos", href: "/planos" },
  { valor: "servicos", label: "Serviços", descricao: "Serviços e preços", href: "/servicos" },
  { valor: "financeiro", label: "Financeiro", descricao: "Fechamentos, extratos e valores", href: "/financeiro" },
  { valor: "configuracoes", label: "Configurações", descricao: "Dados do petshop, WhatsApp e mensagens", href: "/configuracoes" },
];

export const TODOS_MODULOS = MODULOS.map((m) => m.valor);

export const PERFIS_PRONTOS: { nome: string; modulos: Modulo[] }[] = [
  { nome: "Recepção", modulos: ["agenda", "clientes"] },
  { nome: "Gerente", modulos: ["agenda", "clientes", "planos", "servicos", "financeiro"] },
  { nome: "Acesso total", modulos: TODOS_MODULOS },
];

/** Módulo que protege uma rota do painel (null = liberada pra todos). */
export function moduloDaRota(pathname: string): Modulo | null {
  return MODULOS.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))?.valor ?? null;
}

export function lerModulos(raw: unknown): Modulo[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is Modulo => TODOS_MODULOS.includes(m as Modulo));
}
