"use client";

import { use, useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cadastrar, type CadastroState } from "./actions";

const initialState: CadastroState = undefined;

type Params = { link?: string; nome?: string; petshop?: string; telefone?: string };

export default function CadastroPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Vindo do link grátis (/meu-link): já preenche e leva o link junto.
  const sp = use(searchParams);
  const texto = (v: string | undefined) => (typeof v === "string" ? v.slice(0, 80) : undefined);
  const [state, formAction, isPending] = useActionState(cadastrar, initialState);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  return (
    <AuthShell>
      <div className="rounded-card glass p-7">
        <h1 className="text-3xl font-extrabold tracking-tight">Criar conta do petshop</h1>
        <p className="mt-1.5 text-[15px] font-medium text-muted-foreground">
          Leva um minuto. Depois é só conectar o WhatsApp e cadastrar os serviços.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Seu nome</Label>
            <Input id="nome" name="nome" autoComplete="name" autoFocus placeholder="Maria Silva" required defaultValue={texto(sp.nome)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="petshop">Nome do petshop</Label>
            <Input id="petshop" name="petshop" autoComplete="organization" placeholder="PetShop Araquari" required defaultValue={texto(sp.petshop)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telefone">
              WhatsApp do petshop <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input id="telefone" name="telefone" inputMode="tel" autoComplete="tel" placeholder="(47) 99999-9999" defaultValue={texto(sp.telefone)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@petshop.com" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="senha">Senha</Label>
            <div className="relative">
              <Input
                id="senha"
                name="senha"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
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
            <span className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</span>
          </div>
          {sp.link && <input type="hidden" name="link" value={sp.link.slice(0, 80)} />}
          {/* Armadilha pra robô: invisível pra gente, preenchido por bot. */}
          <input
            type="text"
            name="site"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] size-px opacity-0"
          />
          {state?.error && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={isPending} className="mt-2">
            {isPending ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
