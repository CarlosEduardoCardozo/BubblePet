"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const ALL_VALUE = "__todos__";

export type SelectOption = { value: string; label: string };

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  allLabel = "Todos",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  allLabel?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? options.filter((option) =>
        option.label.toLowerCase().includes(search.trim().toLowerCase())
      )
    : options;

  // O Select do base-ui não espelha o texto do SelectItem selecionado — ele
  // resolve o label via itemToStringLabel/items/objeto-com-.label, senão cai
  // pro valor bruto. Como options muda (busca filtra a lista), resolvemos o
  // label manualmente via children-como-função em vez de depender de um
  // mapa "items" estático no Select.
  const labelFor = (val: string) =>
    val === ALL_VALUE ? allLabel : (options.find((o) => o.value === val)?.label ?? val);

  return (
    <Select
      value={value || ALL_VALUE}
      onValueChange={(next) => {
        onChange(!next || next === ALL_VALUE ? "" : next);
        setSearch("");
      }}
    >
      <SelectTrigger className="h-8 w-full rounded-[12px]">
        <SelectValue placeholder={placeholder}>
          {(val: unknown) => labelFor(val as string)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <div className="relative p-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Pesquise/Selecione"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {filtered.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
