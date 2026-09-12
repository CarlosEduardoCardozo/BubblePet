"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Cake, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormSelect } from "@/components/shared/FormSelect";
import { createPet, deletePet, updatePet } from "./actions";
import { assinarPlano } from "./planos-actions";
import { AssinaturaSection } from "./AssinaturaSection";
import type { Pet, Tutor, PlanoOption } from "./TutoresTable";

const ESPECIES = [
  { value: "cachorro", label: "Cachorro" },
  { value: "gato", label: "Gato" },
  { value: "outro", label: "Outro" },
];

const PORTES = [
  { value: "pequeno", label: "Pequeno" },
  { value: "medio", label: "Médio" },
  { value: "grande", label: "Grande" },
];

function idade(nascimento: string | null): string | null {
  if (!nascimento) return null;
  const nasc = DateTime.fromISO(nascimento);
  if (!nasc.isValid) return null;
  const diff = DateTime.now().diff(nasc, ["years", "months"]);
  const anos = Math.floor(diff.years);
  const meses = Math.floor(diff.months);
  if (anos >= 1) return `${anos} ano${anos === 1 ? "" : "s"}`;
  return `${meses} ${meses === 1 ? "mês" : "meses"}`;
}

function PetForm({
  pet,
  planos,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  pet?: Pet | null;
  planos: PlanoOption[];
  pending: boolean;
  error: string | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const isEdit = !!pet;
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-[12px] border border-primary/30 bg-primary/5 p-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pet-nome">Nome</Label>
        <Input id="pet-nome" name="nome" defaultValue={pet?.nome} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pet-especie">Espécie</Label>
          <FormSelect
            id="pet-especie"
            name="especie"
            defaultValue={pet?.especie ?? "cachorro"}
            options={ESPECIES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pet-porte">Porte</Label>
          <FormSelect
            id="pet-porte"
            name="porte"
            defaultValue={pet?.porte ?? undefined}
            options={PORTES}
            placeholder="—"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pet-raca">Raça</Label>
          <Input id="pet-raca" name="raca" defaultValue={pet?.raca ?? undefined} placeholder="SRD" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pet-nascimento">Nascimento</Label>
          <Input
            id="pet-nascimento"
            name="nascimento"
            type="date"
            defaultValue={pet?.nascimento ?? undefined}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pet-observacoes">Observações</Label>
        <Textarea
          id="pet-observacoes"
          name="observacoes"
          rows={2}
          defaultValue={pet?.observacoes ?? undefined}
          placeholder="Alergias, temperamento, cuidados no banho..."
        />
      </div>
      {!isEdit && planos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pet-plano">
            Plano <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <FormSelect
            id="pet-plano"
            name="plano_id"
            placeholder="Sem plano"
            options={planos.map((plano) => ({
              value: plano.id,
              label: plano.nome,
              hint: `${plano.creditos_mes} banho${plano.creditos_mes === 1 ? "" : "s"} por mês`,
            }))}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando..." : isEdit ? "Salvar" : "Adicionar pet"}
        </Button>
      </div>
    </form>
  );
}

export function PetsSheet({
  open,
  onOpenChange,
  tutor,
  planos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tutor: Tutor;
  planos: PlanoOption[];
}) {
  const [modo, setModo] = useState<"lista" | "novo" | { editar: string }>("lista");
  const [deletingPetId, setDeletingPetId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const petsAtivos = tutor.pets.filter((p) => p.ativo);
  const deletingPet = petsAtivos.find((p) => p.id === deletingPetId) ?? null;
  const editingPet =
    typeof modo === "object" ? (petsAtivos.find((p) => p.id === modo.editar) ?? null) : null;

  function fecharForm() {
    setModo("lista");
    setError(null);
  }

  function handleAddPet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const planoId = (formData.get("plano_id") as string) || "";
    setError(null);
    startTransition(async () => {
      const result = await createPet(tutor.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      if (planoId) {
        const assinaturaResult = await assinarPlano(result.petId, planoId);
        if ("error" in assinaturaResult) {
          toast.error("Pet cadastrado, mas não foi possível ativar o plano. Tente pelo card do pet.");
          fecharForm();
          return;
        }
      }

      toast.success(planoId ? "Pet cadastrado e plano ativado." : "Pet cadastrado.");
      fecharForm();
    });
  }

  function handleEditPet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPet) return;
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updatePet(editingPet.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Pet atualizado.");
      fecharForm();
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
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Pets de {tutor.nome}</SheetTitle>
            <SheetDescription>
              {petsAtivos.length === 0
                ? "Nenhum pet cadastrado ainda."
                : `${petsAtivos.length} pet${petsAtivos.length === 1 ? "" : "s"} · plano e créditos do mês por pet.`}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
            {petsAtivos.map((pet) =>
              editingPet?.id === pet.id ? (
                <PetForm
                  key={pet.id}
                  pet={pet}
                  planos={planos}
                  pending={isPending}
                  error={error}
                  onSubmit={handleEditPet}
                  onCancel={fecharForm}
                />
              ) : (
                <div
                  key={pet.id}
                  className="flex flex-col gap-2 rounded-[12px] border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{pet.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          ESPECIES.find((e) => e.value === pet.especie)?.label ?? pet.especie,
                          pet.raca,
                          PORTES.find((p) => p.value === pet.porte)?.label,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {idade(pet.nascimento) && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Cake size={12} /> {idade(pet.nascimento)}
                        </p>
                      )}
                      {pet.observacoes && (
                        <p className="mt-1 rounded-[8px] bg-warning/10 px-2 py-1 text-xs text-warning-foreground">
                          {pet.observacoes}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${pet.nome}`}
                        title="Editar pet"
                        onClick={() => {
                          setError(null);
                          setModo({ editar: pet.id });
                        }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover ${pet.nome}`}
                        title="Remover pet"
                        onClick={() => setDeletingPetId(pet.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Plano</span>
                    <AssinaturaSection petId={pet.id} petNome={pet.nome} planos={planos} />
                  </div>
                </div>
              )
            )}

            {modo === "novo" ? (
              <PetForm
                planos={planos}
                pending={isPending}
                error={error}
                onSubmit={handleAddPet}
                onCancel={fecharForm}
              />
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setError(null);
                  setModo("novo");
                }}
              >
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
        description="O pet deixa de aparecer nas listas e no link de agendamento. O histórico é mantido."
        confirmLabel="Remover"
        pendingLabel="Removendo..."
        onConfirm={handleDeletePet}
        pending={isPending}
      />
    </>
  );
}
