import { Search, LogOut } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
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

      <div className="relative ml-4 hidden max-w-sm flex-1 md:block">
        <Search
          size={16}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input placeholder="Buscar..." className="pl-8" disabled />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {iniciais(donoNome) || "?"}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {donoNome}
        </span>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Sair">
            <LogOut size={16} />
          </Button>
        </form>
      </div>
    </header>
  );
}
