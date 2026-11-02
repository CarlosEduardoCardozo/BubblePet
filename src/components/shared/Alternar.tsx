"use client";

import { cn } from "@/lib/utils";

/** Interruptor liga/desliga acessível (role="switch"). */
export function Alternar({
  ligado,
  onChange,
  rotulo,
  disabled = false,
}: {
  ligado: boolean;
  onChange: (ligado: boolean) => void;
  /** Texto lido por leitor de tela. */
  rotulo: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        ligado ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          ligado ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
