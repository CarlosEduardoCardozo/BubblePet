import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Input de valor em reais: prefixo "R$" fixo, teclado numérico no celular. */
export function CurrencyInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        inputMode="decimal"
        placeholder="0,00"
        className={cn("pl-9", className)}
        {...props}
      />
    </div>
  );
}
