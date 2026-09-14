"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FormSelectOption = { value: string; label: string; hint?: string };

/**
 * Select do shadcn/base-ui pra formulários: aceita `name` (vai no FormData),
 * `defaultValue` ou `value` controlado. Pra listas longas com busca, use o
 * Combobox (busca dentro do Select do base-ui não funciona).
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
  disabled?: boolean;
  className?: string;
}) {
  const labelFor = (val: string) => options.find((o) => o.value === val)?.label ?? "";

  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onValueChange={(next) => {
        onValueChange?.(typeof next === "string" ? next : "");
      }}
    >
      <SelectTrigger id={id} className={cn("h-9 w-full rounded-[12px] bg-white", className)}>
        <SelectValue placeholder={placeholder}>
          {(val: unknown) => (typeof val === "string" && val ? labelFor(val) : placeholder)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            Nenhuma opção
          </div>
        )}
        {options.map((option) => (
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
