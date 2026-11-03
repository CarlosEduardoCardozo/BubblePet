"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopiarBotao({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1800);
        } catch {
          /* sem permissão de área de transferência: o link continua visível */
        }
      }}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-semibold text-secondary-foreground hover:brightness-95"
    >
      {copiado ? <Check size={15} /> : <Copy size={15} />}
      {copiado ? "Copiado" : rotulo}
    </button>
  );
}
