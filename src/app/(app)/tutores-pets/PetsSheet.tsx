"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { createPet, deletePet } from "./actions";
import type { Tutor } from "./TutoresTable";

export function PetsSheet({
  open,
  onOpenChange,
  tutor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tutor: Tutor;
}) {
  const [showForm, setShowForm] = useState(false);
  const [deletingPetId, setDeletingPetId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const petsAtivos = tutor.pets.filter((p) => p.ativo);
  const deletingPet = petsAtivos.find((p) => p.id === deletingPetId) ?? null;

  function handleAddPet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await createPet(tutor.id, formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success("Pet cadastrado.");
        form.reset();
        setShowForm(false);
      }
    });
  }

  function handleDeletePet() {
    if (!deletingPetId) return;
    startTransition(async () => {
      const result = await deletePet(deletingPetId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Pet removido.");
        setDeletingPetId(null);
      }
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Pets de {tutor.nome}</SheetTitle>
            <SheetDescription>Gerencie os pets deste tutor.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 overflow-y-auto px-4">
            {petsAtivos.length === 0 && !showForm && (
              <p className="text-sm text-muted-foreground">
                Nenhum pet cadastrado ainda.
              </p>
            )}

            {petsAtivos.map((pet) => (
              <div
                key={pet.id}
                className="flex items-center justify-between rounded-[12px] border border-border p-3"
              >
                <div>
                  <p className="font-medium">{pet.nome}</p>
                  <p className="text-sm text-muted-foreground">
                    {pet.especie}
                    {pet.raca ? ` · ${pet.raca}` : ""}
                    {pet.porte ? ` · ${pet.porte}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir ${pet.nome}`}
                  onClick={() => setDeletingPetId(pet.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}

            {showForm ? (
              <form
                onSubmit={handleAddPet}
                className="flex flex-col gap-3 rounded-[12px] border border-border p-3"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pet-nome">Nome</Label>
                  <Input id="pet-nome" name="nome" required autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pet-especie">Espécie</Label>
                    <Input
                      id="pet-especie"
                      name="especie"
                      defaultValue="cachorro"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pet-porte">Porte</Label>
                    <select
                      id="pet-porte"
                      name="porte"
                      defaultValue=""
                      className="h-8 rounded-[12px] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">—</option>
                      <option value="pequeno">Pequeno</option>
                      <option value="medio">Médio</option>
                      <option value="grande">Grande</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pet-raca">Raça</Label>
                  <Input id="pet-raca" name="raca" />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Salvando..." : "Adicionar pet"}
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" onClick={() => setShowForm(true)}>
                <Plus size={16} /> Adicionar pet
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deletingPet}
        onOpenChange={(o) => !o && setDeletingPetId(null)}
        title={`Remover ${deletingPet?.nome ?? "pet"}?`}
        description="O pet deixa de aparecer nas listagens. Essa ação não pode ser desfeita pela tela."
        onConfirm={handleDeletePet}
        pending={isPending}
      />
    </>
  );
}
