"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PawPrint } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Entrar" da landing. Quem já está logado não passa pela tela de login:
 * aparece o loader da plataforma e vai direto pro painel. O loader fica na
 * tela até o painel estar pronto (o router mantém a página atual montada
 * enquanto a próxima carrega). Sem sessão, é um link normal pro /login.
 */
export function EntrarLink({
  className,
  children = "Entrar",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);

  async function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd+clique, botão do meio etc.: deixa o navegador abrir em outra aba.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();

    // getSession lê o cookie local, sem ida à rede. O painel ainda valida a
    // sessão no servidor; se ela tiver expirado, o proxy manda pro /login.
    let logado = false;
    try {
      const { data } = await createClient().auth.getSession();
      logado = !!data.session;
    } catch {
      logado = false;
    }

    if (logado) {
      setAbrindo(true);
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }

  return (
    <>
      <Link href="/login" onClick={onClick} className={className}>
        {children}
      </Link>
      {/* Portal no body: o menu de vidro tem backdrop-filter, que prenderia o
          "fixed" do loader dentro dele em vez de cobrir a tela toda. */}
      {abrindo && createPortal(<LoaderPlataforma />, document.body)}
    </>
  );
}

export function LoaderPlataforma() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="lp-loader fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-brand"
    >
      <div aria-hidden className="absolute -top-40 -right-32 size-[30rem] rounded-full bg-[#ffd34d]/40 mix-blend-screen blur-3xl" />
      <div aria-hidden className="absolute -bottom-40 -left-24 size-[32rem] rounded-full bg-[#c4b5fd]/40 blur-3xl" />

      {/* Bolhas subindo */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {[
          "left-[12%] size-6 [animation-delay:0s]",
          "left-[28%] size-3 [animation-delay:.9s]",
          "left-[46%] size-8 [animation-delay:.4s]",
          "left-[63%] size-4 [animation-delay:1.4s]",
          "left-[80%] size-7 [animation-delay:.2s]",
          "left-[90%] size-3 [animation-delay:1.1s]",
        ].map((b) => (
          <span key={b} className={`lp-bubble lp-rise absolute -bottom-10 ${b}`} />
        ))}
      </div>

      <div className="relative flex flex-col items-center">
        <span className="relative flex size-24 items-center justify-center">
          <span aria-hidden className="lp-ping absolute inset-0 rounded-[32px] border-2 border-white/50" />
          <span className="lp-pulse relative flex size-24 items-center justify-center rounded-[32px] border border-white/40 bg-white/20 backdrop-blur-md">
            <PawPrint size={42} />
            <span className="absolute -top-1 -right-1 size-5 rounded-full bg-sun" />
          </span>
        </span>
        <p className="mt-8 text-3xl font-black tracking-tight">BubblePet</p>
        <p className="mt-2 flex items-center gap-1 text-base font-semibold text-white/80">
          Abrindo seu painel
          <span aria-hidden className="flex gap-1 pl-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="lp-dot size-1.5 rounded-full bg-[#ffd34d]"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        </p>
        <div className="mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
          <span className="lp-bar block h-full w-1/3 rounded-full bg-sun" />
        </div>
      </div>
    </div>
  );
}
