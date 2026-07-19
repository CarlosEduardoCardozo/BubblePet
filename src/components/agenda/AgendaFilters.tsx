"use client";

import { X } from "lucide-react";
import { AGENDAMENTO_STATUSES } from "@/lib/agendamento";
import { STATUS_LABELS, type PetOption, type ServicoOption } from "./AgendaView";

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

const selectClassName =
  "h-8 rounded-[12px] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
        <span className="text-sm font-medium">Filtros</span>
        {hasFilters && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <X size={12} /> Limpar filtros
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-status">
          Status
        </label>
        <select
          id="filtro-status"
          value={filters.status}
          onChange={(event) => onChange({ ...filters, status: event.target.value })}
          className={selectClassName}
        >
          <option value="">Todos</option>
          {AGENDAMENTO_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-pet">
          Pet
        </label>
        <select
          id="filtro-pet"
          value={filters.petId}
          onChange={(event) => onChange({ ...filters, petId: event.target.value })}
          className={selectClassName}
        >
          <option value="">Todos</option>
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.nome} — {pet.tutorNome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-servico">
          Serviço
        </label>
        <select
          id="filtro-servico"
          value={filters.servicoId}
          onChange={(event) => onChange({ ...filters, servicoId: event.target.value })}
          className={selectClassName}
        >
          <option value="">Todos</option>
          {servicos.map((servico) => (
            <option key={servico.id} value={servico.id}>
              {servico.nome}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
