"use client";

import { useRef, useState, useTransition } from "react";
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
  const formRef = useRef<HTMLFormElement>(null);
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
        toast.success(isEdit ? "Tutor atualizado." : "Tutor cadastrado.");
        onOpenChange(false);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar tutor" : "Novo tutor"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Atualize os dados do tutor."
              : "Cadastre um novo tutor do petshop."}
          </SheetDescription>
        </SheetHeader>

        <form
          ref={formRef}
          key={tutor?.id ?? "new"}
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={tutor?.nome} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telefone">Telefone</Label>
            <Input
              id="telefone"
              name="telefone"
              placeholder="(47) 99999-9999"
              defaultValue={tutor ? formatPhoneBR(tutor.telefone) : undefined}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={tutor?.email ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" name="cpf" defaultValue={tutor?.cpf ?? undefined} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              defaultValue={tutor?.observacoes ?? undefined}
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
