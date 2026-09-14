"use client";

import { useState, useTransition } from "react";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/shared/Combobox";
import { formatPhoneBR } from "@/lib/phone";
import { PORTES } from "@/lib/servico-preco";
import { cn } from "@/lib/utils";
import { criarClienteEPet, type PetCriado } from "@/app/(app)/agenda/actions";
import type { TutorOption } from "./AgendaView";

const ESPECIES = [
  { valor: "cachorro", label: "Cachorro" },
  { valor: "gato", label: "Gato" },
  { valor: "outro", label: "Outro" },
] as const;

function Chips<T extends string>({
  opcoes,
  valor,
  onChange,
  permitirVazio,
}: {
  opcoes: readonly { valor: T; label: string }[];
  valor: T | "";
  onChange: (v: T | "") => void;
  permitirVazio?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(ativo && permitirVazio ? "" : o.valor)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              ativo
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-white hover:border-primary hover:text-primary"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Cadastro rápido dentro do agendamento: pet novo pra um cliente existente
 * ou cliente + pet de uma vez. O resto do cadastro (CPF, e-mail...) fica pra
 * tela de Clientes.
 */
export function NovoClientePet({
  tutores,
  nomeInicial,
  onCriado,
  onCancelar,
}: {
  tutores: TutorOption[];
  nomeInicial: string;
  onCriado: (pet: PetCriado) => void;
  onCancelar: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [tutorId, setTutorId] = useState("");
  const [tutorNome, setTutorNome] = useState("");
  const [tutorTelefone, setTutorTelefone] = useState("");
  const [petNome, setPetNome] = useState(nomeInicial);
  const [especie, setEspecie] = useState<"cachorro" | "gato" | "outro" | "">("cachorro");
  const [porte, setPorte] = useState<"pequeno" | "medio" | "grande" | "">("");

  function salvar() {
    setErro(null);
    if (modo === "existente" && !tutorId) {
      setErro("Escolha o cliente.");
      return;
    }
    startTransition(async () => {
      const result = await criarClienteEPet({
        tutorId: modo === "existente" ? tutorId : "",
        tutorNome,
        tutorTelefone,
        petNome,
        especie: especie || "cachorro",
        porte,
      });
      if ("error" in result) {
        setErro(result.error);
        return;
      }
      onCriado(result.pet);
    });
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-[12px] border border-primary/30 bg-primary/5 p-3"
      // Fica dentro do form do agendamento: Enter aqui cadastra o pet em vez
      // de enviar o agendamento pela metade.
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          if (!isPending) salvar();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Cadastrar pet</span>
        <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-border">
          <button
            type="button"
            onClick={() => setModo("novo")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
              modo === "novo" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            <UserPlus size={12} /> Cliente novo
          </button>
          <button
            type="button"
            onClick={() => setModo("existente")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
              modo === "existente" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            <Users size={12} /> Já é cliente
          </button>
        </div>
      </div>

      {modo === "existente" ? (
        <div className="flex flex-col gap-1.5">
          <Label>Cliente</Label>
          <Combobox
            value={tutorId}
            onValueChange={setTutorId}
            placeholder="Buscar cliente..."
            searchPlaceholder="Nome ou telefone"
            options={tutores.map((t) => ({
              value: t.id,
              label: t.nome,
              hint: t.telefone ? formatPhoneBR(t.telefone) : undefined,
            }))}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="novo_tutor_nome">Nome do cliente</Label>
            <Input
              id="novo_tutor_nome"
              value={tutorNome}
              onChange={(e) => setTutorNome(e.target.value)}
              placeholder="Maria Silva"
              autoComplete="off"
              className="bg-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="novo_tutor_tel">WhatsApp</Label>
            <Input
              id="novo_tutor_tel"
              value={tutorTelefone}
              onChange={(e) => setTutorTelefone(e.target.value)}
              placeholder="(47) 99999-9999"
              inputMode="tel"
              autoComplete="off"
              className="bg-white"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="novo_pet_nome">Nome do pet</Label>
        <Input
          id="novo_pet_nome"
          value={petNome}
          onChange={(e) => setPetNome(e.target.value)}
          placeholder="Thor"
          autoComplete="off"
          className="bg-white"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Espécie</Label>
        <Chips opcoes={ESPECIES} valor={especie} onChange={setEspecie} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Porte</Label>
        <Chips
          opcoes={PORTES.map((p) => ({ valor: p.valor, label: p.label }))}
          valor={porte}
          onChange={setPorte}
          permitirVazio
        />
        <span className="text-xs text-muted-foreground">Define o preço quando o serviço tem valor por porte.</span>
      </div>

      {erro && (
        <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar} disabled={isPending}>
          Voltar
        </Button>
        <Button type="button" size="sm" onClick={salvar} disabled={isPending}>
          {isPending ? "Cadastrando..." : "Cadastrar e selecionar"}
        </Button>
      </div>
    </div>
  );
}
