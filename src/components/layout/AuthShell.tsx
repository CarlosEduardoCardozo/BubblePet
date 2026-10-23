import { CalendarDays, MessageCircle, PawPrint, Wallet } from "lucide-react";
import { Brand } from "./Sidebar";

const DESTAQUES = [
  { icon: CalendarDays, texto: "Agenda com horários livres e lembretes automáticos" },
  { icon: Wallet, texto: "Planos de banho com créditos mensais e fechamento em PDF" },
  { icon: MessageCircle, texto: "Tudo pelo WhatsApp do petshop, sem app pro cliente" },
];

/** Moldura do login e do cadastro: marca à esquerda (desktop), card à direita. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 gap-6 p-0 lg:p-6">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden rounded-[40px] bg-brand p-12 lg:flex">
        {/* Luzes do painel: amarelo forte em cima, lilás embaixo. */}
        <div className="pointer-events-none absolute -top-40 -right-32 size-[26rem] rounded-full bg-[#ffd34d]/40 mix-blend-screen blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[30rem] rounded-full bg-[#c4b5fd]/40 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(255_255_255/0.18),transparent_45%)]" />

        <div className="relative flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
          <span className="relative flex size-11 items-center justify-center rounded-2xl border border-white/40 bg-white/20 backdrop-blur-md">
            <PawPrint size={20} />
            <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-sun" />
          </span>
          BubblePet
        </div>
        <div className="relative flex flex-col gap-10">
          <h2 className="max-w-md text-[2.6rem] leading-[1.08] font-extrabold tracking-tight">
            Seu petshop organizado.
            <br />
            <span className="text-[#ffd34d]">Seus clientes encantados.</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {DESTAQUES.map(({ icon: Icon, texto }) => (
              <li
                key={texto}
                className="flex max-w-md items-center gap-3 rounded-full border border-white/25 bg-white/12 py-2 pr-5 pl-2 text-sm font-medium backdrop-blur-md"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sun">
                  <Icon size={15} />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/70">© {new Date().getFullYear()} BubblePet</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
