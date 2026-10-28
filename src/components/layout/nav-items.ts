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
} from "lucide-react";
import type { Modulo } from "@/lib/permissoes";

/** O que o usuário logado pode ver no menu. */
export type MenuAcesso = { admin: boolean; dono: boolean; modulos: Modulo[] };

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/hoje", label: "Hoje", icon: ClipboardList },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/tutores-pets", label: "Clientes e pets", icon: Users },
  { href: "/oportunidades", label: "Oportunidades", icon: TrendingUp },
  { href: "/fidelidade", label: "Fidelidade", icon: Gift },
  { href: "/planos", label: "Planos", icon: Wallet },
  { href: "/servicos", label: "Serviços", icon: Scissors },
  { href: "/estoque", label: "Estoque", icon: Package },
  { href: "/financeiro", label: "Financeiro", icon: Landmark },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

/** Só o dono do petshop cadastra a equipe e define as permissões. */
export const EQUIPE_ITEM = { href: "/equipe", label: "Equipe", icon: UserCog } as const;

/** Só aparece pra quem está em ADMIN_EMAILS (dono do BubblePet). */
export const ADMIN_ITEM = { href: "/admin", label: "Admin", icon: ShieldCheck } as const;
