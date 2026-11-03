"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/admin", label: "Contas" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/disparos", label: "Disparos" },
  { href: "/admin/plataforma", label: "Plataforma" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções do admin" className="flex flex-wrap gap-2">
      {ABAS.map((a) => {
        const ativa = a.href === "/admin" ? pathname === "/admin" : pathname.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              ativa ? "bg-brand" : "glass text-muted-foreground hover:text-foreground"
            )}
          >
            {a.label}
          </Link>
        );
      })}
    </nav>
  );
}
