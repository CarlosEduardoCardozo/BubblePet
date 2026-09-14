"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Store } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneBR } from "@/lib/phone";
import type { HorarioSemana } from "@/lib/agenda/slots";
import { updatePetshop } from "./actions";
import { HorarioSemanaEditor, linhasDaSemana, semanaDasLinhas } from "./HorarioSemanaEditor";


export type PetshopFormData = {
  nome: string;
  telefone: string | null;
  endereco: string | null;
  chave_pix: string | null;
  dia_fechamento: number;
  horario_semana: HorarioSemana;
  capacidade_por_horario: number;
};

export function PetshopForm({ petshop }: { petshop: PetshopFormData }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linhas, setLinhas] = useState(() => linhasDaSemana(petshop.horario_semana));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("horario_semana", JSON.stringify(semanaDasLinhas(linhas)));
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
            <HorarioSemanaEditor linhas={linhas} onChange={setLinhas} />
            <p className="-mt-1 text-xs text-muted-foreground">
              A agenda e o link de agendamento só oferecem horários dentro do expediente de cada
              dia, sem atravessar o intervalo. Feriados nacionais fecham sozinhos.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capacidade_por_horario">Banhos ao mesmo tempo</Label>
                <Input
                  id="capacidade_por_horario"
                  name="capacidade_por_horario"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={petshop.capacidade_por_horario}
                  required
                />
                <span className="text-xs text-muted-foreground">
                  Quantos pets dá pra atender no mesmo horário.
                </span>
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
