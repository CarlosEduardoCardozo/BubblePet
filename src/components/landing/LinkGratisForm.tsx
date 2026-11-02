"use client";

import { useActionState } from "react";
import { ArrowRight, ExternalLink, Lock, MessageCircle, PartyPopper } from "lucide-react";
import { CopiarBotao } from "@/components/link-gratis/CopiarBotao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServicosEditor } from "@/components/link-gratis/ServicosEditor";
import { criarLinkAction, type CriarLinkState } from "@/lib/link-gratis/actions";
import { SERVICOS_SUGERIDOS } from "@/lib/link-gratis/comum";

const INICIAL = SERVICOS_SUGERIDOS.map((nome) => ({ nome, preco_centavos: null }));

export function LinkGratisForm() {
  const [state, formAction, isPending] = useActionState<CriarLinkState, FormData>(criarLinkAction, undefined);

  if (state?.ok) {
    const compartilhar = `https://wa.me/?text=${encodeURIComponent(
      `Agora dá pra agendar o banho do seu pet com a gente por aqui: ${state.linkPublico} 🐾`
    )}`;
    return (
      <div className="flex flex-col gap-5" role="status">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-sun">
            <PartyPopper size={20} />
          </span>
          <div>
            <p className="text-xl font-extrabold tracking-tight">Seu link está no ar!</p>
            <p className="text-sm font-medium text-muted-foreground">{state.nomePetshop}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white bg-white/80 p-4">
          <p className="text-xs font-bold tracking-wide text-primary uppercase">Link pros seus clientes</p>
          <p className="mt-1 truncate font-mono text-sm font-semibold">{state.linkPublico}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopiarBotao texto={state.linkPublico} />
            <a
              href={compartilhar}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25d366] px-3.5 text-sm font-semibold text-white hover:brightness-105"
            >
              <MessageCircle size={15} /> Mandar no WhatsApp
            </a>
            <a
              href={state.linkPublico}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary"
            >
              <ExternalLink size={15} /> Ver
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-primary/30 bg-secondary/60 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary uppercase">
            <Lock size={12} /> Sua página de pedidos (só sua)
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Veja os pedidos e edite seus serviços.{" "}
            {state.avisoEnviado
              ? "Também mandamos este link pro seu WhatsApp."
              : "Guarde este link: é por ele que você volta aqui."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={state.linkGestao} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold">
              Abrir minha página <ArrowRight size={15} />
            </a>
            <CopiarBotao texto={state.linkGestao} rotulo="Copiar link" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lg-petshop">Nome do petshop</Label>
          <Input id="lg-petshop" name="nomePetshop" autoComplete="organization" placeholder="PetShop Araquari" required maxLength={80} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lg-nome">Seu nome</Label>
          <Input id="lg-nome" name="nomeDono" autoComplete="name" placeholder="Maria Silva" required maxLength={80} className="h-10" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lg-whats">Seu WhatsApp</Label>
        <Input id="lg-whats" name="whatsapp" inputMode="tel" autoComplete="tel" placeholder="(47) 99999-9999" required className="h-10" />
        <span className="text-xs text-muted-foreground">É aqui que os pedidos dos seus clientes vão chegar.</span>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Serviços que você oferece</legend>
        <ServicosEditor inicial={INICIAL} />
      </fieldset>

      <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <input type="checkbox" name="aceite" required className="mt-0.5 size-4 accent-[#7c3aed]" />
        <span>Aceito receber os pedidos e mensagens do BubblePet neste WhatsApp.</span>
      </label>

      {/* Armadilha pra robô. */}
      <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] size-px opacity-0" />

      {state && !state.ok && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.erro}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isPending} className="h-12 text-base">
        {isPending ? "Criando seu link..." : "Criar meu link grátis"} {!isPending && <ArrowRight />}
      </Button>
    </form>
  );
}
