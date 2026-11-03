"use client";

import { useActionState } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registrarLead, type LeadState } from "@/app/lead-actions";

/** "Prefere conversar?": deixa o WhatsApp e a equipe chama. */
export function LeadForm() {
  const [state, action, isPending] = useActionState<LeadState, FormData>(registrarLead, undefined);

  if (state?.ok) {
    return (
      <div role="status" className="flex flex-col items-center gap-2 rounded-3xl bg-white/70 px-6 py-8 text-center shadow-sm">
        <CheckCircle2 className="text-emerald-600" size={32} />
        <p className="text-lg font-extrabold">Recebemos seu contato!</p>
        <p className="text-sm font-medium text-muted-foreground">Em breve a gente te chama no WhatsApp para mostrar como funciona.</p>
      </div>
    );
  }

  return (
    <form action={action} className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-3xl bg-white/70 p-5 text-left shadow-sm sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Seu nome
          <Input name="nome" autoComplete="name" placeholder="Maria Silva" required maxLength={80} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          WhatsApp
          <Input name="telefone" inputMode="tel" autoComplete="tel" placeholder="(47) 99999-9999" required />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Nome do petshop <span className="text-xs font-medium text-muted-foreground">(opcional)</span>
        <Input name="petshop" autoComplete="organization" placeholder="PetShop Araquari" maxLength={80} />
      </label>
      {/* Campo escondido: robô que preenche tudo cai aqui. */}
      <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state?.error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
        <MessageCircle size={18} /> {isPending ? "Enviando..." : "Quero que me chamem"}
      </Button>
      <p className="text-center text-xs font-medium text-muted-foreground">Sem compromisso. Usamos seu contato só para falar do BubblePet.</p>
    </form>
  );
}
