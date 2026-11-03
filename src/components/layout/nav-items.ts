import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Wallet,
  Scissors,
  Landmark,
  Settings,
  ShieldCheck,
  ClipboardList,
  Gift,
  Package,
  TrendingUp,
  UserCog,
  BarChart3,
  GraduationCap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Modulo } from "@/lib/permissoes";

/** O que o usuário logado pode ver no menu. */
export type MenuAcesso = { admin: boolean; dono: boolean; modulos: Modulo[] };

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Só o dono do petshop cadastra a equipe e define as permissões. */
  somenteDono?: boolean;
  /** Só aparece pra quem está em ADMIN_EMAILS (dono do BubblePet). */
  somenteAdmin?: boolean;
};

export type NavGrupo = { titulo: string | null; itens: NavItem[] };

/** Menu em grupos: o dia a dia no topo, o resto organizado por assunto. */
export const NAV_GRUPOS: NavGrupo[] = [
  {
    titulo: null,
    itens: [
      { href: "/dashboard", label: "Início", icon: LayoutDashboard },
      { href: "/hoje", label: "Hoje", icon: ClipboardList },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    titulo: "Clientes",
    itens: [
      { href: "/tutores-pets", label: "Clientes e pets", icon: Users },
      { href: "/oportunidades", label: "Oportunidades", icon: TrendingUp },
      { href: "/fidelidade", label: "Fidelidade", icon: Gift },
      { href: "/planos", label: "Planos", icon: Wallet },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/servicos", label: "Serviços", icon: Scissors },
      { href: "/estoque", label: "Estoque", icon: Package },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/financeiro", label: "Financeiro", icon: Landmark },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/tutoriais", label: "Tutoriais", icon: GraduationCap },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
      { href: "/equipe", label: "Equipe", icon: UserCog, somenteDono: true },
      { href: "/admin", label: "Admin", icon: ShieldCheck, somenteAdmin: true },
    ],
  },
];
