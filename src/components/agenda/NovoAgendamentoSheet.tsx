"use client";

import { useEffect, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/shared/FormSelect";
import { createClient } from "@/lib/supabase/client";
import { formatCentavos } from "@/lib/currency";
import {
  calcularHorariosLivres,
  diaAberto,
  ZONE,
  type HorarioFuncionamento,
  type Ocupado,
} from "@/lib/agenda/slots";
import {
  createAgendamento,
  createAgendamentoComPlano,
} from "@/app/(app)/agenda/actions";
import type { PetOption, ServicoOption } from "./AgendaView";

type PlanoInfo = { saldo: number; creditosMes: number; planoNome: string };

export function NovoAgendamentoSheet({
  open,
  onOpenChange,
  slot,
  pets,
  servicos,
  horario,
  ocupados,
  whatsappConectado,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: { start: Date } | null;
  pets: PetOption[];
  servicos: ServicoOption[];
  horario: HorarioFuncionamento;
  ocupados: Ocupado[];
  whatsappConectado: boolean;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [petId, setPetId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [planoInfo, setPlanoInfo] = useState<PlanoInfo | null | undefined>(undefined);
  const [usarPlano, setUsarPlano] = useState(true);
  const [avisar, setAvisar] = useState(true);

  // Pré-preenche data/hora quando o slot muda (clique na grade ou no painel).
  const slotKey = slot ? slot.start.getTime() : 0;
  const [slotAplicado, setSlotAplicado] = useState(0);
  if (slot && slotKey !== slotAplicado) {
    setSlotAplicado(slotKey);
    const dt = DateTime.fromJSDate(slot.start).setZone(ZONE);
    setData(dt.toISODate()!);
    setHora(dt.toFormat("HH:mm"));
  }

  const servico = servicos.find((s) => s.id === servicoId) ?? null;
  const duracao = servico?.duracao_min ?? 30;

  // Horários que cabem no dia escolhido; a hora do slot clicado entra mesmo
  // fora do passo de 30 min (a grade é de 10 em 10).
  const horariosOpcoes = (() => {
    if (!data) return [] as string[];
    const livres = calcularHorariosLivres({
      dataISO: data,
      duracaoMin: duracao,
      ocupados,
      horario,
      stepMin: 30,
      antecedenciaMin: 0,
    }).map((dt) => dt.toFormat("HH:mm"));
    const set = new Set(livres);
    if (hora) set.add(hora);
    return Array.from(set).sort();
  })();

  const inicioEscolhido =
    data && hora ? DateTime.fromISO(`${data}T${hora}`, { zone: ZONE }) : null;
  const fimEscolhido = inicioEscolhido ? inicioEscolhido.plus({ minutes: duracao }) : null;
  const conflito =
    !!inicioEscolhido &&
    !!fimEscolhido &&
    ocupados.some((o) => {
      const oi = DateTime.fromISO(o.inicio);
      const of = DateTime.fromISO(o.fim);
      return inicioEscolhido < of && fimEscolhido > oi;
    });
  const diaFechado = !!data && !diaAberto(data, horario);

  useEffect(() => {
    if (!petId || !servicoId || !data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa o crédito de uma seleção anterior antes de buscar a nova
      setPlanoInfo(undefined);
      return;
    }
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from("assinaturas")
        .select("id, planos!inner(nome, creditos_mes, servico_id)")
        .eq("pet_id", petId)
        .eq("status", "ativa")
        .eq("planos.servico_id", servicoId)
        .limit(1);

      const row = rows?.[0] as unknown as
        | { id: string; planos: { nome: string; creditos_mes: number } }
        | undefined;
      if (!row) {
        if (!cancelled) setPlanoInfo(null);
        return;
      }

      const competencia = DateTime.fromISO(data, { zone: ZONE }).startOf("month").toISODate();
      const { data: saldoRow } = await supabase
        .from("saldo_creditos")
        .select("saldo")
        .eq("assinatura_id", row.id)
        .eq("competencia", competencia)
        .maybeSingle();

      if (!cancelled) {
        setPlanoInfo({
          saldo: saldoRow?.saldo ?? 0,
          creditosMes: row.planos.creditos_mes,
          planoNome: row.planos.nome,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [petId, servicoId, data]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null);
      setPetId("");
      setServicoId("");
      setPlanoInfo(undefined);
      setUsarPlano(true);
      setSlotAplicado(0);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!inicioEscolhido?.isValid) {
      setError("Escolha a data e o horário.");
      return;
    }
    if (conflito) {
      setError("Já existe um agendamento nesse horário.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("pet_id", petId);
    formData.set("servico_id", servicoId);
    formData.set("inicio", inicioEscolhido.toISO()!);
    if (whatsappConectado && avisar) formData.set("avisar", "on");

    const usandoCredito = usarPlano && !!planoInfo && planoInfo.saldo > 0;

    startTransition(async () => {
      const result = usandoCredito
        ? await createAgendamentoComPlano(formData)
        : await createAgendamento(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        const aviso = whatsappConectado && avisar ? " O tutor vai receber a confirmação no WhatsApp." : "";
        toast.success(
          (usandoCredito ? "Agendado com crédito do plano." : "Agendamento criado.") + aviso
        );
        onSaved();
      }
    });
  }

  const usandoCredito = usarPlano && !!planoInfo && planoInfo.saldo > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Novo agendamento</SheetTitle>
          <SheetDescription>
            Se o pet tiver plano com crédito, o banho sai sem custo.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pet_id">Pet</Label>
            <FormSelect
              id="pet_id"
              value={petId}
              onValueChange={setPetId}
              placeholder="Buscar pet ou tutor..."
              searchable
              searchPlaceholder="Nome do pet ou do tutor"
              options={pets.map((pet) => ({
                value: pet.id,
                label: pet.nome,
                hint: pet.tutorNome,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="servico_id">Serviço</Label>
            <FormSelect
              id="servico_id"
              value={servicoId}
              onValueChange={setServicoId}
              placeholder="Selecione um serviço"
              options={servicos.map((s) => ({
                value: s.id,
                label: s.nome,
                hint: `${s.duracao_min} min · ${formatCentavos(s.preco_centavos)}`,
              }))}
            />
          </div>

          {/* Altura reservada: o bloco do plano não pode empurrar o form
              quando a resposta chega. */}
          <div className="min-h-12 rounded-[12px] bg-primary/5 px-3 py-2 text-sm">
            {planoInfo === undefined ? (
              <p className="text-muted-foreground">
                {petId && servicoId ? "Verificando plano do pet..." : "Escolha o pet e o serviço para ver se há plano."}
              </p>
            ) : planoInfo === null ? (
              <p className="text-muted-foreground">
                Sem plano para esse serviço — entra como avulso
                {servico ? ` (${formatCentavos(servico.preco_centavos)})` : ""}.
              </p>
            ) : planoInfo.saldo > 0 ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={usarPlano}
                  onChange={(event) => setUsarPlano(event.target.checked)}
                  className="size-4 accent-primary"
                />
                <span>
                  Usar crédito do <span className="font-medium text-primary">{planoInfo.planoNome}</span>{" "}
                  ({planoInfo.saldo} de {planoInfo.creditosMes} restantes)
                </span>
              </label>
            ) : (
              <p className="text-muted-foreground">
                {planoInfo.planoNome}: créditos do mês esgotados — este atendimento não usará o plano.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={data}
                onChange={(event) => {
                  setData(event.target.value);
                  setHora("");
                }}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hora">Horário</Label>
              <FormSelect
                id="hora"
                value={hora}
                onValueChange={setHora}
                placeholder={data ? "Escolha" : "Data primeiro"}
                disabled={!data || diaFechado}
                searchable={horariosOpcoes.length > 12}
                options={horariosOpcoes.map((h) => ({ value: h, label: h }))}
              />
            </div>
          </div>

          <p className="-mt-2 text-xs text-muted-foreground">
            {diaFechado
              ? "O petshop não abre nesse dia."
              : conflito
                ? "Esse horário já está ocupado — escolha outro."
                : fimEscolhido
                  ? `Termina às ${fimEscolhido.toFormat("HH:mm")} (${duracao} min).`
                  : `Duração de ${duracao} min, conforme o serviço.`}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" rows={2} placeholder="Ex.: tosa na máquina 5, não usar perfume" />
          </div>

          {whatsappConectado && (
            <label className="flex items-start gap-2.5 rounded-[12px] border border-border px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={avisar}
                onChange={(event) => setAvisar(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Avisar o tutor pelo WhatsApp</span>
                <span className="text-xs text-muted-foreground">
                  Ele recebe os dados do agendamento com os botões Confirmar e Cancelar — a resposta
                  muda a agenda sozinha.
                </span>
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <SheetFooter className="flex-row justify-end px-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !petId || !servicoId || conflito || diaFechado}>
              {isPending ? "Salvando..." : usandoCredito ? "Agendar com plano" : "Agendar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
