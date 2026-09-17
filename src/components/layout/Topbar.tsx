import Link from "next/link";
import { LogOut, MessageCircle } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobileNav } from "./MobileNav";
import type { MenuAcesso } from "./nav-items";

function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

export function Topbar({
  petshopNome,
  donoNome,
  whatsappConectado,
  menu,
}: {
  petshopNome: string;
  donoNome: string;
  whatsappConectado: boolean;
  menu: MenuAcesso;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-white px-4 md:px-6">
      <MobileNav menu={menu} />
      <span className="truncate font-semibold text-foreground">{petshopNome}</span>

      <div className="ml-auto flex items-center gap-1">
        {(() => {
          const classe = cn(
            "flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-xs font-medium transition-colors",
            whatsappConectado ? "text-success" : "text-muted-foreground"
          );
          const titulo = whatsappConectado ? "WhatsApp conectado" : "WhatsApp desconectado";
          const indicador = (
            <>
            <MessageCircle size={16} />
            <span
              className={cn(
                "size-2 rounded-full",
                whatsappConectado ? "bg-success" : "bg-muted-foreground/50"
              )}
            />
            <span className="hidden sm:inline">
              {whatsappConectado ? "WhatsApp on" : "WhatsApp off"}
            </span>
            </>
          );
          // Só quem cuida das configurações vai pra tela de conexão.
          return menu.modulos.includes("configuracoes") ? (
            <Link
              href="/configuracoes"
              title={whatsappConectado ? titulo : `${titulo} — clique para conectar`}
              className={cn(classe, "hover:bg-muted")}
            >
              {indicador}
            </Link>
          ) : (
            <span title={titulo} className={classe}>
              {indicador}
            </span>
          );
        })()}

        <div className="mx-1 flex items-center gap-2 sm:mx-2">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {iniciais(donoNome) || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm text-muted-foreground md:inline">
            {donoNome}
          </span>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Sair" title="Sair">
            <LogOut size={16} />
          </Button>
        </form>
      </div>
    </header>
  );
}
