import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Wallet,
  Scissors,
  Landmark,
  Settings,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import type { Modulo } from "@/lib/permissoes";

/** O que o usuário logado pode ver no menu. */
export type MenuAcesso = { admin: boolean; dono: boolean; modulos: Modulo[] };

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/tutores-pets", label: "Clientes e pets", icon: Users },
  { href: "/planos", label: "Planos", icon: Wallet },
  { href: "/servicos", label: "Serviços", icon: Scissors },
  { href: "/financeiro", label: "Financeiro", icon: Landmark },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

/** Só o dono do petshop cadastra a equipe e define as permissões. */
export const EQUIPE_ITEM = { href: "/equipe", label: "Equipe", icon: UserCog } as const;

/** Só aparece pra quem está em ADMIN_EMAILS (dono do BubblePet). */
export const ADMIN_ITEM = { href: "/admin", label: "Admin", icon: ShieldCheck } as const;
