"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPhoneBR } from "@/lib/phone";
import { createTutor, updateTutor } from "./actions";
import type { Tutor } from "./TutoresTable";

export function TutorSheet({
  open,
  onOpenChange,
  tutor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tutor?: Tutor | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!tutor;

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = tutor
        ? await updateTutor(tutor.id, formData)
        : await createTutor(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success(isEdit ? "Cliente atualizado." : "Cliente cadastrado.");
        onOpenChange(false);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar cliente" : "Novo cliente"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Atualize os dados de contato."
              : "O telefone é o WhatsApp do tutor — é por ele que chegam lembretes e o extrato."}
          </SheetDescription>
        </SheetHeader>

        <form
          key={tutor?.id ?? "new"}
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={tutor?.nome} required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telefone">WhatsApp</Label>
            <Input
              id="telefone"
              name="telefone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(47) 99999-9999"
              defaultValue={tutor ? formatPhoneBR(tutor.telefone) : undefined}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={tutor?.email ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cpf">CPF <span className="font-normal text-muted-foreground">(opcional, para nota fiscal)</span></Label>
            <Input id="cpf" name="cpf" inputMode="numeric" defaultValue={tutor?.cpf ?? undefined} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              defaultValue={tutor?.observacoes ?? undefined}
              rows={3}
              placeholder="Preferências, como chegar, quem busca o pet..."
            />
          </div>
          {error && (
            <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <SheetFooter className="flex-row justify-end px-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
