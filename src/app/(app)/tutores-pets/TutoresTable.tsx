"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, PawPrint, Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatPhoneBR } from "@/lib/phone";
import { TutorSheet } from "./TutorSheet";
import { PetsSheet } from "./PetsSheet";
import { deleteTutor } from "./actions";

export type Pet = {
  id: string;
  nome: string;
  especie: string;
  raca: string | null;
  porte: string | null;
  nascimento: string | null;
  observacoes: string | null;
  ativo: boolean;
};

export type Tutor = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  cpf: string | null;
  observacoes: string | null;
  pets: Pet[];
};

export function TutoresTable({
  tutores,
  page,
  totalPages,
}: {
  tutores: Tutor[];
  page: number;
  totalPages: number;
}) {
  const [formTarget, setFormTarget] = useState<"new" | string | null>(null);
  const [petsTutorId, setPetsTutorId] = useState<string | null>(null);
  const [deletingTutorId, setDeletingTutorId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editingTutor =
    typeof formTarget === "string"
      ? (tutores.find((t) => t.id === formTarget) ?? null)
      : null;
  const petsTutor = tutores.find((t) => t.id === petsTutorId) ?? null;
  const deletingTutor = tutores.find((t) => t.id === deletingTutorId) ?? null;

  function handleDelete() {
    if (!deletingTutorId) return;
    const nome = deletingTutor?.nome ?? "Tutor";
    startTransition(async () => {
      const result = await deleteTutor(deletingTutorId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`${nome} removido.`);
        setDeletingTutorId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tutores & Pets</h1>
        <Button onClick={() => setFormTarget("new")}>
          <Plus size={16} /> Novo tutor
        </Button>
      </div>

      <SearchInput placeholder="Buscar por nome..." />

      {tutores.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">Nenhum tutor cadastrado ainda.</p>
          <Button onClick={() => setFormTarget("new")}>
            <Plus size={16} /> Cadastrar o primeiro tutor
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Pets</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tutores.map((tutor) => {
                const petsAtivos = tutor.pets.filter((p) => p.ativo);
                return (
                  <TableRow key={tutor.id}>
                    <TableCell className="font-medium">{tutor.nome}</TableCell>
                    <TableCell>{formatPhoneBR(tutor.telefone)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {tutor.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPetsTutorId(tutor.id)}
                      >
                        <PawPrint size={14} /> {petsAtivos.length}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${tutor.nome}`}
                          onClick={() => setFormTarget(tutor.id)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir ${tutor.nome}`}
                          onClick={() => setDeletingTutorId(tutor.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} />

      <TutorSheet
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        tutor={editingTutor}
      />

      {petsTutor && (
        <PetsSheet
          open={!!petsTutor}
          onOpenChange={(open) => !open && setPetsTutorId(null)}
          tutor={petsTutor}
        />
      )}

      <ConfirmDialog
        open={!!deletingTutorId}
        onOpenChange={(open) => !open && setDeletingTutorId(null)}
        title={`Excluir ${deletingTutor?.nome ?? "tutor"}?`}
        description="Isso também remove todos os pets cadastrados para este tutor. Essa ação não pode ser desfeita."
        onConfirm={handleDelete}
        pending={isPending}
      />
    </div>
  );
}
