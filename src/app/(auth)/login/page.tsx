"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = undefined;

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  return (
    <AuthShell>
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
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Ainda não usa o BubblePet?{" "}
        <Link href="/cadastro" className="font-medium text-primary hover:underline">
          Criar conta do petshop
        </Link>
      </p>
    </AuthShell>
  );
}
