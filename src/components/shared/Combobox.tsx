"use client";

import { useId, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; hint?: string };

/** "João" casa com "joao": busca sem acento e sem caixa. */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Select com busca. O Select do base-ui não serve pra isso (o foco pula pros
 * itens e o campo de busca para de receber o que se digita), então aqui é um
 * popover com um input de verdade e a lista filtrada embaixo.
 */
export function Combobox({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyLabel = "Nada encontrado",
  allLabel,
  createLabel,
  onCreate,
  disabled,
  size = "default",
  className,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Primeira opção que limpa o valor ("Todos"). */
  allLabel?: string;
  /** Ação no fim da lista, recebe o texto buscado (ex.: cadastrar novo). */
  createLabel?: string;
  onCreate?: (termo: string) => void;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const termo = normalizarBusca(busca);
  const filtradas = termo
    ? options.filter((o) => normalizarBusca(`${o.label} ${o.hint ?? ""}`).includes(termo))
    : options;

  // Itens navegáveis por teclado, na ordem em que aparecem.
  type Item = { tipo: "todos" } | { tipo: "opcao"; opcao: ComboboxOption } | { tipo: "criar" };
  const itens: Item[] = [
    ...(allLabel && !termo ? [{ tipo: "todos" } as const] : []),
    ...filtradas.map((opcao) => ({ tipo: "opcao", opcao }) as const),
    ...(onCreate ? [{ tipo: "criar" } as const] : []),
  ];

  const selecionada = options.find((o) => o.value === value);
  const rotulo = selecionada ? selecionada.label : value === "" && allLabel ? allLabel : "";

  function abrir(next: boolean) {
    setOpen(next);
    if (next) {
      setBusca("");
      const idx = itens.findIndex((i) => i.tipo === "opcao" && i.opcao.value === value);
      setDestaque(Math.max(0, idx));
    }
  }

  function escolher(item: Item | undefined) {
    if (!item) return;
    if (item.tipo === "criar") {
      onCreate?.(busca.trim());
    } else {
      onValueChange(item.tipo === "todos" ? "" : item.opcao.value);
    }
    setOpen(false);
  }

  function mover(delta: number) {
    if (itens.length === 0) return;
    const proximo = (destaque + delta + itens.length) % itens.length;
    setDestaque(proximo);
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-index="${proximo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  return (
    <Popover.Root open={open} onOpenChange={abrir}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-1.5 rounded-[12px] border border-input bg-white pr-2 pl-2.5 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8" : "h-9",
          className
        )}
      >
        <span className={cn("line-clamp-1", !rotulo && "text-muted-foreground")}>
          {rotulo || placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
          <Popover.Popup
            className="flex max-h-[min(22rem,var(--available-height))] w-(--anchor-width) min-w-56 flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            <div className="relative border-b border-border p-1.5">
              <Search
                size={14}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                autoFocus
                value={busca}
                onChange={(event) => {
                  setBusca(event.target.value);
                  setDestaque(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    mover(1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    mover(-1);
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    escolher(itens[destaque]);
                  }
                }}
                placeholder={searchPlaceholder}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={itens.length ? `${listId}-${destaque}` : undefined}
                className="h-8 w-full rounded-md bg-muted/60 pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus:bg-muted"
              />
            </div>
            <div ref={listaRef} id={listId} role="listbox" className="flex-1 overflow-y-auto p-1">
              {filtradas.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</div>
              )}
              {itens.map((item, index) => {
                const ativo = index === destaque;
                const base = cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  ativo && "bg-accent text-accent-foreground"
                );
                if (item.tipo === "criar") {
                  return (
                    <button
                      key="__criar__"
                      type="button"
                      id={`${listId}-${index}`}
                      data-index={index}
                      onMouseMove={() => setDestaque(index)}
                      onClick={() => escolher(item)}
                      className={cn(base, "mt-1 border-t border-border pt-2 font-medium text-primary")}
                    >
                      <Plus className="size-4 shrink-0" />
                      {createLabel ?? "Cadastrar novo"}
                      {busca.trim() ? ` “${busca.trim()}”` : ""}
                    </button>
                  );
                }
                const val = item.tipo === "todos" ? "" : item.opcao.value;
                const marcado = val === value;
                return (
                  <button
                    key={item.tipo === "todos" ? "__todos__" : item.opcao.value}
                    type="button"
                    role="option"
                    aria-selected={marcado}
                    id={`${listId}-${index}`}
                    data-index={index}
                    onMouseMove={() => setDestaque(index)}
                    onClick={() => escolher(item)}
                    className={base}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{item.tipo === "todos" ? allLabel : item.opcao.label}</span>
                      {item.tipo === "opcao" && item.opcao.hint && (
                        <span className="truncate text-xs text-muted-foreground">{item.opcao.hint}</span>
                      )}
                    </span>
                    {marcado && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
