"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Store } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPhoneBR } from "@/lib/phone";
import { updatePetshop } from "./actions";

const DIAS = [
  { valor: 1, label: "Seg" },
  { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" },
  { valor: 4, label: "Qui" },
  { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" },
  { valor: 7, label: "Dom" },
];

export type PetshopFormData = {
  nome: string;
  telefone: string | null;
  endereco: string | null;
  chave_pix: string | null;
  dia_fechamento: number;
  horario_abertura: string;
  horario_fechamento: string;
  dias_funcionamento: number[];
};

export function PetshopForm({ petshop }: { petshop: PetshopFormData }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState<number[]>(petshop.dias_funcionamento);

  function toggleDia(valor: number) {
    setDias((atual) =>
      atual.includes(valor) ? atual.filter((d) => d !== valor) : [...atual, valor].sort()
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.delete("dias");
    dias.forEach((d) => formData.append("dias", String(d)));
    setError(null);

    startTransition(async () => {
      const result = await updatePetshop(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success("Dados do petshop salvos.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store size={18} className="text-primary" />
          Dados do petshop
        </CardTitle>
        <CardDescription>
          Aparecem no link de agendamento, nas mensagens de WhatsApp e no extrato do mês.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="nome">Nome do petshop</Label>
              <Input id="nome" name="nome" defaultValue={petshop.nome} required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="telefone">WhatsApp do petshop</Label>
              <Input
                id="telefone"
                name="telefone"
                inputMode="tel"
                placeholder="(47) 99999-9999"
                defaultValue={petshop.telefone ? formatPhoneBR(petshop.telefone) : ""}
              />
              <p className="text-xs text-muted-foreground">
                Recebe a mensagem de teste e o relatório do mês.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chave_pix">Chave PIX</Label>
              <Input
                id="chave_pix"
                name="chave_pix"
                placeholder="CPF, CNPJ, e-mail ou telefone"
                defaultValue={petshop.chave_pix ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                Vai impressa no extrato enviado aos tutores.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                name="endereco"
                placeholder="Rua, número, bairro — cidade"
                defaultValue={petshop.endereco ?? ""}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-muted/30 p-4">
            <span className="text-sm font-medium">Funcionamento</span>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="horario_abertura">Abre às</Label>
                <Input
                  id="horario_abertura"
                  name="horario_abertura"
                  type="time"
                  step={1800}
                  defaultValue={petshop.horario_abertura}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="horario_fechamento">Fecha às</Label>
                <Input
                  id="horario_fechamento"
                  name="horario_fechamento"
                  type="time"
                  step={1800}
                  defaultValue={petshop.horario_fechamento}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dia_fechamento">Fecha o mês no dia</Label>
                <Input
                  id="dia_fechamento"
                  name="dia_fechamento"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={petshop.dia_fechamento}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Dias de atendimento</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((dia) => {
                  const ativo = dias.includes(dia.valor);
                  return (
                    <button
                      key={dia.valor}
                      type="button"
                      onClick={() => toggleDia(dia.valor)}
                      aria-pressed={ativo}
                      className={cn(
                        "h-8 rounded-[8px] border px-3 text-sm font-medium transition-colors",
                        ativo
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-white text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {dia.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
