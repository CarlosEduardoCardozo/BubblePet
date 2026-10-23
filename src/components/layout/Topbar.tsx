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
    <header className="flex h-16 items-center gap-2 px-4 pt-2 md:h-20 md:px-8 lg:pt-6 lg:pr-10 lg:pl-4">
      <MobileNav menu={menu} />
      <span className="truncate text-sm font-semibold text-muted-foreground">{petshopNome}</span>

      <div className="ml-auto flex items-center gap-2">
        {(() => {
          const classe = cn(
            "flex h-10 items-center gap-2 rounded-full glass px-3.5 text-xs font-semibold transition-colors",
            whatsappConectado ? "text-success" : "text-muted-foreground"
          );
          const titulo = whatsappConectado ? "WhatsApp conectado" : "WhatsApp desconectado";
          const indicador = (
            <>
            <MessageCircle size={16} />
            <span
              className={cn(
                "size-2 rounded-full",
                whatsappConectado
                  ? "bg-success shadow-[0_0_0_3px_rgb(22_163_74/0.18)]"
                  : "bg-muted-foreground/50"
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
              className={cn(classe, "hover:bg-white")}
            >
              {indicador}
            </Link>
          ) : (
            <span title={titulo} className={classe}>
              {indicador}
            </span>
          );
        })()}

        <div className="flex h-10 items-center gap-2 rounded-full glass py-1 pr-1 pl-1 md:pr-4">
          <Avatar className="size-8">
            <AvatarFallback className="bg-sun text-xs font-bold">
              {iniciais(donoNome) || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-semibold md:inline">
            {donoNome}
          </span>
        </div>
        <form action={logout}>
          <Button
            type="submit"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut size={16} />
          </Button>
        </form>
      </div>
    </header>
  );
}
