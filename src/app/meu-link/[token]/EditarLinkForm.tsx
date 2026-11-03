"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServicosEditor } from "@/components/link-gratis/ServicosEditor";
import { salvarLinkAction, type SalvarLinkState } from "@/lib/link-gratis/actions";
import type { ServicoGratis } from "@/lib/link-gratis/comum";

export function EditarLinkForm({
  token,
  nomePetshop,
  endereco,
  servicos,
}: {
  token: string;
  nomePetshop: string;
  endereco: string | null;
  servicos: ServicoGratis[];
}) {
  const [state, formAction, isPending] = useActionState<SalvarLinkState, FormData>(
    salvarLinkAction.bind(null, token),
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ed-nome">Nome do petshop</Label>
          <Input id="ed-nome" name="nomePetshop" defaultValue={nomePetshop} required maxLength={80} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ed-end">
            Endereço <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input id="ed-end" name="endereco" defaultValue={endereco ?? ""} maxLength={160} placeholder="Rua, número, bairro" className="h-10" />
        </div>
      </div>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">Serviços</legend>
        <ServicosEditor inicial={servicos} />
      </fieldset>
      {state && !state.ok && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.erro}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
        {state?.ok && !isPending && (
          <span role="status" className="flex items-center gap-1 text-sm font-semibold text-success">
            <Check size={15} /> Salvo
          </span>
        )}
      </div>
    </form>
  );
}
