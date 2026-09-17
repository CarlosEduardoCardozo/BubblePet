import { Eye, LogOut } from "lucide-react";
import { sairDoModoSuporte } from "@/app/(app)/suporte-actions";

/** Só aparece no navegador do admin — o usuário não vê nada. */
export function SuporteBanner({ usuario, petshop }: { usuario: string; petshop: string }) {
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-1.5 text-sm text-amber-950">
      <Eye size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>Modo suporte:</strong> você está vendo como <strong>{usuario}</strong>
        {petshop ? ` (${petshop})` : ""}. O que você fizer aqui fica registrado como se fosse ele.
      </span>
      <form action={sairDoModoSuporte}>
        <button
          type="submit"
          className="flex items-center gap-1 rounded-md bg-amber-950 px-2.5 py-1 text-xs font-medium text-amber-50 hover:bg-amber-900"
        >
          <LogOut size={12} /> Voltar pro admin
        </button>
      </form>
    </div>
  );
}
