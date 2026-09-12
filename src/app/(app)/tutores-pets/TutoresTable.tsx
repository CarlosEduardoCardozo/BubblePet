"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Plus, PawPrint, Pencil, Trash2, SearchX, Users } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatPhoneBR } from "@/lib/phone";
import { TutorSheet } from "./TutorSheet";
import { PetsSheet } from "./PetsSheet";
import { deleteTutor } from "./actions";

const ZONE = "America/Sao_Paulo";

export type Pet = {
  id: string;
  nome: string;
  especie: string;
  raca: string | null;
  porte: string | null;
  nascimento: string | null;
  observacoes: string | null;
  ativo: boolean;
  // assinaturas: one-to-many (array). Dentro dela, planos é many-to-one
  // (objeto único) — confirmado direto na API REST, não dá pra confiar na
  // inferência de tipo do supabase-js aqui (não geramos os tipos do banco).
  assinaturas: { status: string; planos: { nome: string } | null }[];
};

function planosAtivosDoTutor(pets: Pet[]): string[] {
  const nomes = new Set<string>();
  for (const pet of pets) {
    for (const assinatura of pet.assinaturas) {
      const nomePlano = assinatura.planos?.nome;
      if (assinatura.status === "ativa" && nomePlano) {
        nomes.add(nomePlano);
      }
    }
  }
  return Array.from(nomes);
}

export type Tutor = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  cpf: string | null;
  observacoes: string | null;
  pets: Pet[];
  proximoAgendamento?: string | null;
};

export type PlanoOption = { id: string; nome: string; creditos_mes: number };

function formatProximo(iso: string): string {
  const dt = DateTime.fromISO(iso).setZone(ZONE).setLocale("pt-BR");
  const hoje = DateTime.now().setZone(ZONE);
  if (dt.hasSame(hoje, "day")) return `Hoje às ${dt.toFormat("HH:mm")}`;
  if (dt.hasSame(hoje.plus({ days: 1 }), "day")) return `Amanhã às ${dt.toFormat("HH:mm")}`;
  return dt.toFormat("dd/LL 'às' HH:mm");
}

export function TutoresTable({
  tutores,
  totalTutores,
  totalPets,
  busca,
  page,
  totalPages,
  planos,
}: {
  tutores: Tutor[];
  totalTutores: number;
  totalPets: number;
  busca: string;
  page: number;
  totalPages: number;
  planos: PlanoOption[];
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
    const nome = deletingTutor?.nome ?? "Cliente";
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

  const subtitulo =
    totalTutores === 0
      ? "Nenhum cliente cadastrado"
      : `${totalTutores} cliente${totalTutores === 1 ? "" : "s"} · ${totalPets} pet${totalPets === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes e pets"
        description={subtitulo}
        action={
          <Button onClick={() => setFormTarget("new")}>
            <Plus size={16} /> Novo cliente
          </Button>
        }
      />

      <SearchInput placeholder="Buscar por nome ou telefone..." />

      {tutores.length === 0 ? (
        busca ? (
          <EmptyState
            icon={SearchX}
            title={`Nenhum cliente encontrado para “${busca}”`}
            description="Confira a grafia ou tente buscar pelo telefone."
            action={
              <Button variant="outline" nativeButton={false} render={<Link href="/tutores-pets" />}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Nenhum cliente cadastrado ainda"
            description="Cadastre o tutor e os pets dele. Depois é só marcar na agenda ou assinar um plano."
            action={
              <Button onClick={() => setFormTarget("new")}>
                <Plus size={16} /> Cadastrar o primeiro cliente
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Pets</TableHead>
                <TableHead className="hidden md:table-cell">Plano</TableHead>
                <TableHead className="hidden lg:table-cell">Próximo atendimento</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tutores.map((tutor) => {
                const petsAtivos = tutor.pets.filter((p) => p.ativo);
                const planosAtivos = planosAtivosDoTutor(petsAtivos);
                return (
                  <TableRow
                    key={tutor.id}
                    className="cursor-pointer"
                    onClick={() => setPetsTutorId(tutor.id)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{tutor.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatPhoneBR(tutor.telefone)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {petsAtivos.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Sem pets</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {petsAtivos.slice(0, 3).map((pet) => (
                            <span
                              key={pet.id}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                            >
                              <PawPrint size={11} className="text-muted-foreground" />
                              {pet.nome}
                            </span>
                          ))}
                          {petsAtivos.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{petsAtivos.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {planosAtivos.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {planosAtivos.map((nome) => (
                            <Badge key={nome} variant="secondary" className="text-primary">
                              {nome}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {tutor.proximoAgendamento ? (
                        formatProximo(tutor.proximoAgendamento)
                      ) : (
                        <span className="text-xs text-muted-foreground">Nada marcado</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${tutor.nome}`}
                          title="Editar cliente"
                          onClick={() => setFormTarget(tutor.id)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover ${tutor.nome}`}
                          title="Remover cliente"
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

      {tutores.length > 0 && <Pagination page={page} totalPages={totalPages} />}

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
          planos={planos}
        />
      )}

      <ConfirmDialog
        open={!!deletingTutorId}
        onOpenChange={(open) => !open && setDeletingTutorId(null)}
        title={`Remover ${deletingTutor?.nome ?? "cliente"}?`}
        description="O cliente e os pets dele deixam de aparecer nas listas e no link de agendamento. O histórico de atendimentos é mantido."
        confirmLabel="Remover"
        pendingLabel="Removendo..."
        onConfirm={handleDelete}
        pending={isPending}
      />
    </div>
  );
}
