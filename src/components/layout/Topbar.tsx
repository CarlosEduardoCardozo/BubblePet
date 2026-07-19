import { Search, LogOut } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

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
}: {
  petshopNome: string;
  donoNome: string;
}) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-white px-6">
      <span className="font-semibold text-foreground">{petshopNome}</span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled
          aria-label="Busca global — em breve"
          title="Busca global — em breve"
        >
          <Search size={16} />
        </Button>
        <div className="mx-2 flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {iniciais(donoNome) || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {donoNome}
          </span>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Sair">
            <LogOut size={16} />
          </Button>
        </form>
      </div>
    </header>
  );
}
