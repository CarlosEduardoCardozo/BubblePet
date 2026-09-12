"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AGENDAMENTO_STATUSES, STATUS_LABELS } from "@/lib/agendamento";
import type { PetOption, ServicoOption } from "./AgendaView";
import { SearchableSelect } from "./SearchableSelect";

export type AgendaFiltersState = {
  status: string;
  petId: string;
  servicoId: string;
};

export const EMPTY_FILTERS: AgendaFiltersState = {
  status: "",
  petId: "",
  servicoId: "",
};

export function AgendaFilters({
  filters,
  onChange,
  pets,
  servicos,
}: {
  filters: AgendaFiltersState;
  onChange: (filters: AgendaFiltersState) => void;
  pets: PetOption[];
  servicos: ServicoOption[];
}) {
  const hasFilters = !!(filters.status || filters.petId || filters.servicoId);

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Filtrar semana</span>
        {hasFilters && (
          <Button variant="link" size="xs" className="h-auto p-0" onClick={() => onChange(EMPTY_FILTERS)}>
            <X size={12} /> Limpar
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-status" className="text-xs text-muted-foreground">Status</Label>
          <SearchableSelect
            id="filtro-status"
            value={filters.status}
            onChange={(status) => onChange({ ...filters, status })}
            placeholder="Todos"
            options={AGENDAMENTO_STATUSES.map((status) => ({
              value: status,
              label: STATUS_LABELS[status],
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-pet" className="text-xs text-muted-foreground">Pet</Label>
          <SearchableSelect
            id="filtro-pet"
            value={filters.petId}
            onChange={(petId) => onChange({ ...filters, petId })}
            placeholder="Todos"
            options={pets.map((pet) => ({
              value: pet.id,
              label: `${pet.nome} — ${pet.tutorNome}`,
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-servico" className="text-xs text-muted-foreground">Serviço</Label>
          <SearchableSelect
            id="filtro-servico"
            value={filters.servicoId}
            onChange={(servicoId) => onChange({ ...filters, servicoId })}
            placeholder="Todos"
            options={servicos.map((servico) => ({
              value: servico.id,
              label: servico.nome,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
