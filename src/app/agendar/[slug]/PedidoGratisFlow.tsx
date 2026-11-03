"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pedirAction, type PedidoState } from "@/lib/link-gratis/actions";
import {
  TURNOS,
  formatarPreco,
  linkWhatsapp,
  mensagemDoTutor,
  type ServicoGratis,
  type Turno,
} from "@/lib/link-gratis/comum";
import { cn } from "@/lib/utils";

type Dia = { iso: string; curto: string; semana: string };

const chip =
  "relative rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 border-border bg-white hover:border-primary/40 cursor-pointer";

/**
 * Pedido de agendamento pelo link grátis: o tutor escolhe serviço, dia e
 * turno; o BubblePet avisa o petshop. Depois, se quiser, ele manda o mesmo
 * pedido pelo próprio WhatsApp.
 */
export function PedidoGratisFlow({
  slug,
  petshop,
  servicos,
  dias,
}: {
  slug: string;
  petshop: { nome: string; whatsapp: string; endereco: string | null };
  servicos: ServicoGratis[];
  dias: Dia[];
}) {
  const [state, formAction, isPending] = useActionState<PedidoState, FormData>(
    pedirAction.bind(null, slug),
    undefined
  );
  const [turno, setTurno] = useState<Turno>("manha");

  if (state?.ok) {
    const d = state.dados;
    return (
      <div role="status" className="flex flex-col items-center gap-4 rounded-3xl bg-white p-6 text-center shadow-sm">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/12 text-success">
          <CheckCircle2 size={30} />
        </span>
        <div>
          <h2 className="text-xl font-semibold [font-family:var(--font-display)]">Pedido enviado!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {petshop.nome} recebeu seu pedido de <b>{d.servico}</b> para o <b>{d.petNome}</b> na {d.diaRotulo},{" "}
            {d.turno === "manha" ? "de manhã" : "à tarde"}. A confirmação do horário chega pelo seu WhatsApp.
          </p>
        </div>
        <div className="w-full rounded-2xl bg-[#e9fbe5] p-4 text-left">
          <p className="text-sm font-semibold text-[#14532d]">Quer adiantar a conversa?</p>
          <p className="mt-0.5 text-xs text-[#166534]">
            Opcional: mande o pedido também pelo seu WhatsApp, direto pro petshop.
          </p>
          <a
            href={linkWhatsapp(petshop.whatsapp, mensagemDoTutor(petshop.nome, d))}
            target="_blank"
            rel="noopener"
            className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-[#25d366] text-sm font-semibold text-white hover:brightness-105"
          >
            <MessageCircle size={17} /> Enviar pelo meu WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Qual serviço?</legend>
        <div className="grid grid-cols-2 gap-2">
          {servicos.map((s, i) => (
            <label key={s.nome} className={chip}>
              <input type="radio" name="servico" value={s.nome} defaultChecked={i === 0} required className="sr-only" />
              <span className="block">{s.nome}</span>
              <span className="block text-xs font-medium opacity-75">{formatarPreco(s.preco_centavos)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Qual dia?</legend>
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {dias.map((d, i) => (
            <label key={d.iso} className={cn(chip, "w-[4.5rem] shrink-0 snap-start text-center")}>
              <input type="radio" name="dia" value={d.iso} defaultChecked={i === 1} required className="sr-only" />
              <span className="block text-xs font-medium capitalize opacity-75">{d.semana}</span>
              <span className="block">{d.curto}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Qual turno?</legend>
        <div className="grid grid-cols-2 gap-2">
          {TURNOS.map((t) => (
            <label key={t.valor} className={chip}>
              <input
                type="radio"
                name="turno"
                value={t.valor}
                checked={turno === t.valor}
                onChange={() => setTurno(t.valor)}
                className="sr-only"
              />
              <span className="block">{t.label}</span>
              <span className="block text-xs font-medium opacity-75">{t.detalhe}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pg-pet">Nome do pet</Label>
          <Input id="pg-pet" name="petNome" required maxLength={60} placeholder="Thor" className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pg-nome">Seu nome</Label>
          <Input id="pg-nome" name="tutorNome" autoComplete="name" required maxLength={80} placeholder="Ana Souza" className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pg-tel">Seu WhatsApp</Label>
          <Input id="pg-tel" name="telefone" inputMode="tel" autoComplete="tel" required placeholder="(47) 99999-9999" className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pg-obs">
            Observação <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <textarea
            id="pg-obs"
            name="observacao"
            maxLength={300}
            rows={2}
            placeholder="Porte, raça, se tem nó no pelo..."
            className="w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </div>

      <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] size-px opacity-0" />

      {state && !state.ok && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.erro}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isPending} className="h-12 text-base">
        {isPending ? "Enviando..." : "Pedir agendamento"} {!isPending && <Send />}
      </Button>
      <p className="-mt-3 text-center text-xs text-muted-foreground">
        O petshop confirma o horário com você pelo WhatsApp.
        {petshop.endereco ? ` Endereço: ${petshop.endereco}.` : ""}
      </p>
    </form>
  );
}
