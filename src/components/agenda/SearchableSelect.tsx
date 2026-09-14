"use client";

import { Combobox } from "@/components/shared/Combobox";

export type SelectOption = { value: string; label: string };

/** Filtro da agenda: combobox com busca e a opção "Todos" (valor vazio). */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  allLabel = "Todos",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  allLabel?: string;
}) {
  return (
    <Combobox
      id={id}
      size="sm"
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder={placeholder}
      allLabel={allLabel}
    />
  );
}
