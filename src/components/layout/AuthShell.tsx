import { CalendarDays, MessageCircle, PawPrint, Wallet } from "lucide-react";

const DESTAQUES = [
  { icon: CalendarDays, texto: "Agenda com horários livres e lembretes automáticos" },
  { icon: Wallet, texto: "Planos de banho com créditos mensais e fechamento em PDF" },
  { icon: MessageCircle, texto: "Tudo pelo WhatsApp do petshop, sem app pro cliente" },
];

/** Moldura do login e do cadastro: marca à esquerda (desktop), card à direita. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 bg-gray-50">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-2 text-xl font-semibold">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/15">
            <PawPrint size={20} />
          </span>
          BubblePet
        </div>
        <div className="relative flex flex-col gap-8">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            A gestão do seu petshop, do agendamento ao fechamento do mês.
          </h2>
          <ul className="flex flex-col gap-3">
            {DESTAQUES.map(({ icon: Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-white/15">
                  <Icon size={16} />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-primary-foreground/70">
          © {new Date().getFullYear()} BubblePet
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 text-lg font-semibold text-primary lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
              <PawPrint size={16} />
            </span>
            BubblePet
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
