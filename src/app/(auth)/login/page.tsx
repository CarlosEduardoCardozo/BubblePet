"use client";

import { useActionState, useState } from "react";
import { CalendarDays, Eye, EyeOff, MessageCircle, PawPrint, Wallet } from "lucide-react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = undefined;

const DESTAQUES = [
  { icon: CalendarDays, texto: "Agenda com horários livres e lembretes automáticos" },
  { icon: Wallet, texto: "Planos de banho com créditos mensais e fechamento em PDF" },
  { icon: MessageCircle, texto: "Tudo pelo WhatsApp do petshop, sem app pro cliente" },
];

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [mostrarSenha, setMostrarSenha] = useState(false);

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

          <div className="rounded-[12px] border border-border bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Entrar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use a conta do petshop para acessar o painel.
            </p>

            <form action={formAction} className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="voce@petshop.com"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="senha">Senha</Label>
                <div className="relative">
                  <Input
                    id="senha"
                    name="senha"
                    type={mostrarSenha ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-[6px] text-muted-foreground hover:text-foreground"
                  >
                    {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {state?.error && (
                <p
                  role="alert"
                  className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {state.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="mt-1">
                {isPending ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
