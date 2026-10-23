"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";
import { moduloDaRota } from "@/lib/permissoes";
import { ADMIN_ITEM, EQUIPE_ITEM, NAV_ITEMS, type MenuAcesso } from "./nav-items";

export function NavLinks({
  rail = false,
  menu,
  onNavigate,
}: {
  /** Trilho de ícones do desktop: os rótulos só aparecem quando o menu abre no hover. */
  rail?: boolean;
  menu: MenuAcesso;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const itens = [
    ...NAV_ITEMS.filter((item) => {
      const modulo = moduloDaRota(item.href);
      return !modulo || menu.modulos.includes(modulo);
    }),
    ...(menu.dono ? [EQUIPE_ITEM] : []),
    ...(menu.admin ? [ADMIN_ITEM] : []),
  ];
  return (
    <nav className="flex flex-1 flex-col gap-1.5 px-2.5 py-2">
      {itens.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-label={label}
            className={cn(
              "flex h-11 items-center gap-3 overflow-hidden rounded-full px-[16px] text-sm font-semibold whitespace-nowrap transition-all duration-200",
              active
                ? "bg-brand"
                : "text-muted-foreground hover:bg-white/80 hover:text-foreground"
            )}
          >
            <Icon size={20} className="shrink-0" strokeWidth={active ? 2.2 : 1.9} />
            <span
              className={cn(
                "transition-opacity duration-200",
                rail && "opacity-0 group-hover/rail:opacity-100"
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-foreground">
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand">
        <PawPrint size={19} />
        <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-sun" />
      </span>
      {!compact && (
        <span>
          Bubble<span className="text-primary">Pet</span>
        </span>
      )}
    </span>
  );
}

/** Trilho de vidro flutuante: só ícones, abre por cima do conteúdo no hover. */
export function Sidebar({ menu }: { menu: MenuAcesso }) {
  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-[116px] shrink-0 py-6 pl-6 lg:block">
      <div className="group/rail absolute inset-y-6 left-6 flex w-[76px] flex-col overflow-hidden rounded-[40px] glass transition-[width] duration-300 ease-[cubic-bezier(.22,.61,.36,1)] hover:w-[244px]">
        <div className="flex h-20 shrink-0 items-center px-[18px]">
          <Link href="/dashboard" aria-label="Início" className="flex items-center gap-2.5 whitespace-nowrap">
            <Brand compact />
            <span className="text-lg font-extrabold tracking-tight opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100">
              Bubble<span className="text-primary">Pet</span>
            </span>
          </Link>
        </div>
        <NavLinks rail menu={menu} />
      </div>
    </aside>
  );
}
