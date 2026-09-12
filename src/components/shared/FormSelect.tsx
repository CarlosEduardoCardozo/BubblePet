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
import { cn } from "@/lib/utils";

export type FormSelectOption = { value: string; label: string; hint?: string };

/**
 * Select do shadcn/base-ui pra formulários: aceita `name` (vai no FormData),
 * `defaultValue` ou `value` controlado, e busca opcional pra listas longas.
 * O label do item selecionado é resolvido aqui — o Select.Value do base-ui
 * não lê o texto do SelectItem sozinho.
 */
export function FormSelect({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = "Selecione...",
  searchable = false,
  searchPlaceholder = "Buscar...",
  disabled,
  className,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [search, setSearch] = useState("");

  const termo = search.trim().toLowerCase();
  const filtered = termo
    ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(termo))
    : options;

  const labelFor = (val: string) => options.find((o) => o.value === val)?.label ?? "";

  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onValueChange={(next) => {
        onValueChange?.(typeof next === "string" ? next : "");
        setSearch("");
      }}
    >
      <SelectTrigger id={id} className={cn("h-9 w-full rounded-[12px] bg-white", className)}>
        <SelectValue placeholder={placeholder}>
          {(val: unknown) => (typeof val === "string" && val ? labelFor(val) : placeholder)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {searchable && (
          <div className="relative p-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") event.stopPropagation();
              }}
              placeholder={searchPlaceholder}
              className="h-8 pl-7 text-xs"
            />
          </div>
        )}
        {filtered.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            Nada encontrado
          </div>
        )}
        {filtered.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex flex-col">
              <span>{option.label}</span>
              {option.hint && (
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
