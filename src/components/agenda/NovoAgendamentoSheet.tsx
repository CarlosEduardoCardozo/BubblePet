"use client";

import { useEffect, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { Combobox } from "@/components/shared/Combobox";
import { createClient } from "@/lib/supabase/client";
import { formatCentavos } from "@/lib/currency";
import { PORTES, precoParaPorte } from "@/lib/servico-preco";
import {
  calcularHorariosLivres,
  diaAberto,
  horarioCabe,
  ZONE,
  type HorarioFuncionamento,
  type Ocupado,
} from "@/lib/agenda/slots";
import {
  createAgendamento,
  createAgendamentoComPlano,
  type PetCriado,
} from "@/app/(app)/agenda/actions";
import { NovoClientePet } from "./NovoClientePet";
import {
  AdicionaisEditor,
  adicionaisDasLinhas,
  totalDasLinhas,
  type LinhaAdicional,
} from "./AdicionaisEditor";
import type { PetOption, ServicoOption, TutorOption } from "./AgendaView";

type PlanoInfo = { saldo: number; creditosMes: number; planoNome: string };

function rotuloPorte(porte: string | null): string {
  return PORTES.find((p) => p.valor === porte)?.label ?? "";
}

export function NovoAgendamentoSheet({
  open,
  onOpenChange,
  slot,
  pets,
  tutores,
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
  tutores: TutorOption[];
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
  const [adicionais, setAdicionais] = useState<LinhaAdicional[]>([]);
  const [mostrarAdicionais, setMostrarAdicionais] = useState(false);
  const [repetir, setRepetir] = useState<"nao" | "semanal" | "quinzenal" | "mensal">("nao");
  const [vezes, setVezes] = useState("4");
  // Cadastro rápido aberto (com o texto que estava na busca) ou fechado.
  const [cadastro, setCadastro] = useState<{ nome: string } | null>(null);
  // Pets cadastrados aqui aparecem na hora, antes da página recarregar os dados.
  const [petsNovos, setPetsNovos] = useState<PetOption[]>([]);
  const [tutoresNovos, setTutoresNovos] = useState<TutorOption[]>([]);

  const todosPets = [...pets, ...petsNovos.filter((n) => !pets.some((p) => p.id === n.id))];
  const todosTutores = [
    ...tutores,
    ...tutoresNovos.filter((n) => !tutores.some((t) => t.id === n.id)),
  ];

  // Pré-preenche data/hora quando o slot muda (clique na grade ou no painel).
  const slotKey = slot ? slot.start.getTime() : 0;
  const [slotAplicado, setSlotAplicado] = useState(0);
  if (slot && slotKey !== slotAplicado) {
    setSlotAplicado(slotKey);
    const dt = DateTime.fromJSDate(slot.start).setZone(ZONE);
    setData(dt.toISODate()!);
    setHora(dt.toFormat("HH:mm"));
  }

  const pet = todosPets.find((p) => p.id === petId) ?? null;
  const servico = servicos.find((s) => s.id === servicoId) ?? null;
  const duracao = servico?.duracao_min ?? 30;
  const precoServico = servico ? precoParaPorte(servico, pet?.porte) : 0;
  const totalAdicionais = totalDasLinhas(adicionais);

  // Horários que cabem no dia escolhido; a hora do slot clicado entra mesmo
  // fora do passo de 30 min (a grade é de 15 em 15).
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
    !!inicioEscolhido?.isValid &&
    !horarioCabe(inicioEscolhido, duracao, ocupados, horario.capacidade);
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

      // saldo_plano conta com os créditos de um mês futuro ainda não renovado.
      const competencia = DateTime.fromISO(data, { zone: ZONE }).startOf("month").toISODate();
      const { data: saldo } = await supabase.rpc("saldo_plano", {
        p_assinatura_id: row.id,
        p_competencia: competencia,
      });

      if (!cancelled) {
        setPlanoInfo({
          saldo: typeof saldo === "number" ? saldo : 0,
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
      setAdicionais([]);
      setMostrarAdicionais(false);
      setCadastro(null);
      setRepetir("nao");
      setVezes("4");
    }
    onOpenChange(next);
  }

  function handlePetCriado(novo: PetCriado) {
    setPetsNovos((atual) => [
      ...atual,
      { id: novo.id, nome: novo.nome, tutorId: novo.tutorId, tutorNome: novo.tutorNome, porte: novo.porte },
    ]);
    setTutoresNovos((atual) =>
      atual.some((t) => t.id === novo.tutorId)
        ? atual
        : [...atual, { id: novo.tutorId, nome: novo.tutorNome, telefone: null }]
    );
    setPetId(novo.id);
    setCadastro(null);
    toast.success(`${novo.nome} cadastrado.`);
  }

  const usandoCredito = usarPlano && !!planoInfo && planoInfo.saldo > 0;
  const semanasEntre = repetir === "semanal" ? 1 : repetir === "quinzenal" ? 2 : repetir === "mensal" ? 4 : 0;
  const nVezes = Math.min(12, Math.max(2, Number(vezes) || 2));
  const datasSerie =
    semanasEntre && inicioEscolhido?.isValid
      ? Array.from({ length: nVezes }, (_, i) => inicioEscolhido.plus({ weeks: i * semanasEntre }))
      : [];
  const valorBase = usandoCredito ? 0 : precoServico;
  const total = valorBase + totalAdicionais;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (cadastro) {
      setError("Termine o cadastro do pet (ou clique em Voltar) antes de agendar.");
      return;
    }
    if (!inicioEscolhido?.isValid) {
      setError("Escolha a data e o horário.");
      return;
    }
    if (conflito) {
      setError("Já existe um agendamento nesse horário.");
      return;
    }
    const extras = adicionaisDasLinhas(adicionais);
    if (!extras.ok) {
      setError(extras.erro);
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("pet_id", petId);
    formData.set("servico_id", servicoId);
    formData.set("inicio", inicioEscolhido.toISO()!);
    formData.set("adicionais", JSON.stringify(extras.adicionais));
    formData.set("repetir", repetir);
    if (repetir !== "nao") formData.set("vezes", String(nVezes));
    if (whatsappConectado && avisar) formData.set("avisar", "on");

    startTransition(async () => {
      const result = usandoCredito
        ? await createAgendamentoComPlano(formData)
        : await createAgendamento(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        const aviso = whatsappConectado && avisar ? " O tutor vai receber a confirmação no WhatsApp." : "";
        if (result.criados > 1 || result.avisos.length > 0) {
          toast.success(`${result.criados} agendamentos criados.${aviso}`, {
            description: result.avisos.length ? result.avisos.join(" · ") : undefined,
            duration: result.avisos.length ? 10_000 : 4_000,
          });
        } else {
          toast.success(
            (usandoCredito ? "Agendado com crédito do plano." : "Agendamento criado.") + aviso
          );
        }
        handleOpenChange(false);
        onSaved();
      }
    });
  }

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
          {cadastro ? (
            <NovoClientePet
              tutores={todosTutores}
              nomeInicial={cadastro.nome}
              onCriado={handlePetCriado}
              onCancelar={() => setCadastro(null)}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="pet_id">Pet</Label>
                <button
                  type="button"
                  onClick={() => setCadastro({ nome: "" })}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus size={12} /> Novo cliente ou pet
                </button>
              </div>
              <Combobox
                id="pet_id"
                value={petId}
                onValueChange={setPetId}
                placeholder="Buscar pet ou tutor..."
                searchPlaceholder="Nome do pet ou do tutor"
                emptyLabel="Nenhum pet com esse nome"
                createLabel="Cadastrar pet"
                onCreate={(termo) => setCadastro({ nome: termo })}
                options={todosPets.map((p) => ({
                  value: p.id,
                  label: p.nome,
                  hint: [p.tutorNome, rotuloPorte(p.porte)].filter(Boolean).join(" · "),
                }))}
              />
            </div>
          )}

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
                hint: `${s.duracao_min} min · ${formatCentavos(precoParaPorte(s, pet?.porte))}${
                  pet?.porte ? ` (${rotuloPorte(pet.porte).toLowerCase()})` : ""
                }`,
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
                {servico ? ` (${formatCentavos(precoServico)}${pet?.porte ? `, porte ${rotuloPorte(pet.porte).toLowerCase()}` : ""})` : ""}.
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

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="repetir">Repetir</Label>
                <FormSelect
                  id="repetir"
                  value={repetir}
                  onValueChange={(v) => setRepetir((v || "nao") as typeof repetir)}
                  options={[
                    { value: "nao", label: "Não repete" },
                    { value: "semanal", label: "Toda semana" },
                    { value: "quinzenal", label: "A cada 2 semanas" },
                    { value: "mensal", label: "A cada 4 semanas" },
                  ]}
                />
              </div>
              {repetir !== "nao" && (
                <div className="flex w-24 flex-col gap-1.5">
                  <Label htmlFor="vezes">Vezes</Label>
                  <Input
                    id="vezes"
                    type="number"
                    min={2}
                    max={12}
                    value={vezes}
                    onChange={(e) => setVezes(e.target.value)}
                  />
                </div>
              )}
            </div>
            {datasSerie.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {datasSerie.map((d) => d.toFormat("dd/LL")).join(" · ")} às {hora}.
                {usandoCredito ? " Cada data usa um crédito do plano; sem crédito, entra como avulso." : ""}
                {" "}Horário lotado em alguma data: ela é pulada e você é avisado.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Adicionais</Label>
              {!mostrarAdicionais && adicionais.length === 0 && (
                <button
                  type="button"
                  onClick={() => setMostrarAdicionais(true)}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus size={12} /> Cobrar um extra
                </button>
              )}
            </div>
            {mostrarAdicionais || adicionais.length > 0 ? (
              <>
                <AdicionaisEditor
                  linhas={adicionais}
                  onChange={setAdicionais}
                  sugestoesExtras={servicos.filter((s) => s.id !== servicoId).map((s) => s.nome)}
                />
                <p className="text-xs text-muted-foreground">
                  Desembolo, procedimento diferente, taxa... Entra no fechamento do cliente, mesmo
                  quando o banho é do plano.{repetir !== "nao" ? " Vale pra todas as datas da série." : ""}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum extra. Use pra desembolo, hidratação ou outro procedimento cobrado à parte.
              </p>
            )}
          </div>

          {servico && (
            <div className="flex flex-col gap-1 rounded-[12px] border border-border px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{servico.nome}</span>
                <span>{usandoCredito ? "Plano" : formatCentavos(valorBase)}</span>
              </div>
              {totalAdicionais > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adicionais</span>
                  <span>{formatCentavos(totalAdicionais)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total</span>
                <span>{formatCentavos(total)}</span>
              </div>
            </div>
          )}

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
            <Button
              type="submit"
              disabled={isPending || !petId || !servicoId || conflito || diaFechado || !!cadastro}
            >
              {isPending
                ? "Salvando..."
                : datasSerie.length > 1
                  ? `Agendar ${datasSerie.length} datas`
                  : usandoCredito
                    ? "Agendar com plano"
                    : "Agendar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
