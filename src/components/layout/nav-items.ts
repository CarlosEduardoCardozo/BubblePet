import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Wallet,
  Scissors,
  Landmark,
  Settings,
  ShieldCheck,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/tutores-pets", label: "Clientes e pets", icon: Users },
  { href: "/planos", label: "Planos", icon: Wallet },
  { href: "/servicos", label: "Serviços", icon: Scissors },
  { href: "/financeiro", label: "Financeiro", icon: Landmark },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

/** Só aparece pra quem está em ADMIN_EMAILS (dono do BubblePet). */
export const ADMIN_ITEM = { href: "/admin", label: "Admin", icon: ShieldCheck } as const;
