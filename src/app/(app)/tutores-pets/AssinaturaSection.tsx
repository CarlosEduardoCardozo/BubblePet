"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormSelect } from "@/components/shared/FormSelect";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { createClient } from "@/lib/supabase/client";
import { formatCentavos, parseCentavos } from "@/lib/currency";
import {
  adicionarPetAoPlano,
  assinarPlano,
  atualizarPrecoAssinatura,
  cancelarAssinatura,
  removerPetDoPlano,
} from "./planos-actions";

type PlanoOption = { id: string; nome: string; creditos_mes: number; preco_centavos: number };

type AssinaturaInfo = {
  id: string;
  planoNome: string;
  creditosMes: number;
  saldo: number;
  /** Valor que o pet paga por mês (o do pet, se combinado, senão o do plano). */
  precoCentavos: number;
  precoPlanoCentavos: number;
  precoEspecial: boolean;
  /** Outros pets do cliente no mesmo plano, dividindo o saldo. */
  adicionais: { id: string; petId: string; petNome: string; precoCentavos: number }[];
};

/** Este pet é adicional no plano de outro pet. */
type InclusaoInfo = {
  adicionalId: string;
  planoNome: string;
  titularNome: string;
  creditosMes: number;
  saldo: number;
  precoCentavos: number;
};

function paraInput(centavos: number): string {
  return formatCentavos(centavos).replace("R$", "").trim();
}

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro" }
  | { tipo: "ok"; assinatura: AssinaturaInfo | null; inclusao: InclusaoInfo | null };

const competenciaAtual = () =>
  DateTime.now().setZone("America/Sao_Paulo").startOf("month").toISODate();

export function AssinaturaSection({
  petId,
  petNome,
  planos,
  outrosPets = [],
  versao = 0,
  onAlterado,
}: {
  petId: string;
  petNome?: string;
  planos: PlanoOption[];
  /** Outros pets ativos do mesmo cliente (podem entrar como pet adicional). */
  outrosPets?: { id: string; nome: string }[];
  /** Muda quando outro pet do cliente mexe no plano — recarrega este. */
  versao?: number;
  onAlterado?: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [selectedPlano, setSelectedPlano] = useState("");
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  // Plano escolhido esperando o valor ser confirmado / valor em edição.
  const [precoNovo, setPrecoNovo] = useState("");
  const [editandoPreco, setEditandoPreco] = useState(false);
  // Incluir outro pet no plano / tirar um pet adicional.
  const [adicionando, setAdicionando] = useState(false);
  const [petAdicional, setPetAdicional] = useState("");
  const [precoAdicional, setPrecoAdicional] = useState("");
  const [removendo, setRemovendo] = useState<{ id: string; petNome: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function carregar() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("assinaturas")
      .select(
        "id, preco_centavos, planos(nome, creditos_mes, preco_centavos), assinatura_pets_adicionais(id, pet_id, preco_centavos, pets(nome))"
      )
      .eq("pet_id", petId)
      .eq("status", "ativa")
      .order("criado_em", { ascending: false })
      .limit(1);

    if (error) {
      setEstado({ tipo: "erro" });
      return;
    }

    // planos é many-to-one (objeto) na API real; a inferência do supabase-js
    // sem tipos gerados acha que é array.
    const row = data?.[0] as unknown as
      | {
          id: string;
          preco_centavos: number | null;
          planos: { nome: string; creditos_mes: number; preco_centavos: number } | null;
          assinatura_pets_adicionais: {
            id: string;
            pet_id: string;
            preco_centavos: number;
            pets: { nome: string } | null;
          }[];
        }
      | undefined;

    const competencia = competenciaAtual();

    if (!row) {
      await carregarInclusao(competencia);
      return;
    }

    const { data: saldoRow } = await supabase
      .from("saldo_creditos")
      .select("saldo")
      .eq("assinatura_id", row.id)
      .eq("competencia", competencia)
      .maybeSingle();

    setEstado({
      tipo: "ok",
      assinatura: {
        id: row.id,
        planoNome: row.planos?.nome ?? "",
        creditosMes: row.planos?.creditos_mes ?? 0,
        saldo: saldoRow?.saldo ?? 0,
        precoCentavos: row.preco_centavos ?? row.planos?.preco_centavos ?? 0,
        precoPlanoCentavos: row.planos?.preco_centavos ?? 0,
        precoEspecial: row.preco_centavos != null,
        adicionais: (row.assinatura_pets_adicionais ?? []).map((a) => ({
          id: a.id,
          petId: a.pet_id,
          petNome: a.pets?.nome ?? "Pet",
          precoCentavos: a.preco_centavos,
        })),
      },
      inclusao: null,
    });
  }

  /** Sem plano próprio: confere se o pet está no plano de outro pet. */
  async function carregarInclusao(competencia: string | null) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("assinatura_pets_adicionais")
      .select("id, preco_centavos, assinaturas!inner(id, status, pets(nome), planos(nome, creditos_mes))")
      .eq("pet_id", petId)
      .eq("assinaturas.status", "ativa")
      .limit(1);
    if (error) {
      setEstado({ tipo: "erro" });
      return;
    }
    const row = data?.[0] as unknown as
      | {
          id: string;
          preco_centavos: number;
          assinaturas: {
            id: string;
            pets: { nome: string } | null;
            planos: { nome: string; creditos_mes: number } | null;
          };
        }
      | undefined;
    if (!row) {
      setEstado({ tipo: "ok", assinatura: null, inclusao: null });
      return;
    }
    const { data: saldoRow } = await supabase
      .from("saldo_creditos")
      .select("saldo")
      .eq("assinatura_id", row.assinaturas.id)
      .eq("competencia", competencia)
      .maybeSingle();
    setEstado({
      tipo: "ok",
      assinatura: null,
      inclusao: {
        adicionalId: row.id,
        planoNome: row.assinaturas.planos?.nome ?? "",
        titularNome: row.assinaturas.pets?.nome ?? "outro pet",
        creditosMes: row.assinaturas.planos?.creditos_mes ?? 0,
        saldo: saldoRow?.saldo ?? 0,
        precoCentavos: row.preco_centavos,
      },
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a assinatura ativa ao abrir/trocar de pet
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, versao]);

  function escolherPlano(planoId: string) {
    setSelectedPlano(planoId);
    const plano = planos.find((p) => p.id === planoId);
    setPrecoNovo(plano ? paraInput(plano.preco_centavos) : "");
  }

  function lerPreco(): number | null | undefined {
    if (!precoNovo.trim()) return null;
    const centavos = parseCentavos(precoNovo);
    if (centavos == null) {
      toast.error("Valor inválido. Ex.: 120,00");
      return undefined;
    }
    return centavos;
  }

  function handleAssinar() {
    if (!selectedPlano) return;
    const preco = lerPreco();
    if (preco === undefined) return;
    startTransition(async () => {
      const result = await assinarPlano(petId, selectedPlano, preco);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Plano ativado. Os créditos deste mês já estão disponíveis.");
        setSelectedPlano("");
      }
      void carregar();
    });
  }

  function handleSalvarPreco() {
    if (estado.tipo !== "ok" || !estado.assinatura) return;
    const preco = lerPreco();
    if (preco === undefined) return;
    const id = estado.assinatura.id;
    startTransition(async () => {
      const result = await atualizarPrecoAssinatura(id, preco);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Valor do plano atualizado para este pet.");
        setEditandoPreco(false);
        void carregar();
      }
    });
  }

  function handleCancelar() {
    if (estado.tipo !== "ok" || !estado.assinatura) return;
    const id = estado.assinatura.id;
    startTransition(async () => {
      const result = await cancelarAssinatura(id);
      setConfirmCancelar(false);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Plano cancelado.");
        void carregar();
      }
    });
  }

  function handleAdicionarPet() {
    if (estado.tipo !== "ok" || !estado.assinatura || !petAdicional) return;
    if (!precoAdicional.trim()) {
      toast.error("Informe quanto o pet adicional paga por mês (pode ser 0,00).");
      return;
    }
    const preco = parseCentavos(precoAdicional);
    if (preco == null) {
      toast.error("Valor inválido. Ex.: 60,00");
      return;
    }
    const id = estado.assinatura.id;
    startTransition(async () => {
      const result = await adicionarPetAoPlano(id, petAdicional, preco);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Pet incluído no plano. Os banhos do mês agora são divididos entre eles.");
      setAdicionando(false);
      setPetAdicional("");
      setPrecoAdicional("");
      void carregar();
      onAlterado?.();
    });
  }

  function handleRemoverPet() {
    if (!removendo) return;
    const { id } = removendo;
    startTransition(async () => {
      const result = await removerPetDoPlano(id);
      setRemovendo(null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Pet retirado do plano.");
      void carregar();
      onAlterado?.();
    });
  }

  const confirmRemover = (
    <ConfirmDialog
      open={!!removendo}
      onOpenChange={(open) => !open && setRemovendo(null)}
      title={`Tirar ${removendo?.petNome ?? "o pet"} do plano?`}
      description="Ele deixa de usar os banhos do plano e o valor adicional sai do próximo fechamento. Os banhos que ele já usou neste mês continuam contados."
      confirmLabel="Tirar do plano"
      pendingLabel="Tirando..."
      onConfirm={handleRemoverPet}
      pending={isPending}
    />
  );

  if (estado.tipo === "carregando") {
    return <div className="h-8 animate-pulse rounded-lg bg-muted" aria-label="Carregando plano" />;
  }

  if (estado.tipo === "erro") {
    return (
      <p className="text-xs text-destructive">
        Não foi possível carregar o plano.{" "}
        <button type="button" className="underline" onClick={() => void carregar()}>
          Tentar de novo
        </button>
      </p>
    );
  }

  const { assinatura, inclusao } = estado;

  if (inclusao) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/5 px-2.5 py-1.5 text-xs">
          <span className="flex flex-col">
            <span>
              Pet adicional no <span className="font-medium text-primary">{inclusao.planoNome}</span> de{" "}
              {inclusao.titularNome}
            </span>
            <span className="mt-0.5 text-muted-foreground">
              {formatCentavos(inclusao.precoCentavos)}/mês a mais · {inclusao.saldo} de {inclusao.creditosMes}{" "}
              créditos restantes, divididos entre os pets
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            disabled={isPending}
            onClick={() => setRemovendo({ id: inclusao.adicionalId, petNome: petNome ?? "este pet" })}
          >
            Tirar do plano
          </Button>
        </div>
        {confirmRemover}
      </>
    );
  }

  if (assinatura) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/5 px-2.5 py-1.5 text-xs">
          <span className="flex flex-col">
            <span>
              <span className="font-medium text-primary">{assinatura.planoNome}</span>
              {" — "}
              {assinatura.saldo} de {assinatura.creditosMes} créditos restantes
              {assinatura.adicionais.length > 0 && " (divididos entre os pets)"}
            </span>
            {editandoPreco ? (
              <span className="mt-1 flex items-center gap-1">
                <span className="w-28">
                  <CurrencyInput
                    value={precoNovo}
                    onChange={(e) => setPrecoNovo(e.target.value)}
                    className="h-7 text-xs"
                    aria-label="Valor mensal para este pet"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSalvarPreco();
                      }
                    }}
                  />
                </span>
                <Button type="button" size="icon-xs" onClick={handleSalvarPreco} disabled={isPending} aria-label="Salvar valor">
                  <Check size={12} />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setEditandoPreco(false)}
                  disabled={isPending}
                  aria-label="Cancelar edição do valor"
                >
                  <X size={12} />
                </Button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPrecoNovo(paraInput(assinatura.precoCentavos));
                  setEditandoPreco(true);
                }}
                className="mt-0.5 flex items-center gap-1 self-start text-muted-foreground hover:text-foreground"
                title="Mudar o valor só para este pet"
              >
                {formatCentavos(assinatura.precoCentavos)}/mês
                {assinatura.precoEspecial && (
                  <span className="text-muted-foreground">
                    {" "}(valor especial · plano {formatCentavos(assinatura.precoPlanoCentavos)})
                  </span>
                )}
                <Pencil size={10} />
              </button>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            disabled={isPending}
            onClick={() => setConfirmCancelar(true)}
          >
            Cancelar plano
          </Button>
        </div>
        <PetsAdicionais
          assinatura={assinatura}
          outrosPets={outrosPets}
          adicionando={adicionando}
          setAdicionando={setAdicionando}
          petAdicional={petAdicional}
          setPetAdicional={setPetAdicional}
          precoAdicional={precoAdicional}
          setPrecoAdicional={setPrecoAdicional}
          onAdicionar={handleAdicionarPet}
          onRemover={(a) => setRemovendo({ id: a.id, petNome: a.petNome })}
          isPending={isPending}
        />
        {confirmRemover}
        <ConfirmDialog
          open={confirmCancelar}
          onOpenChange={setConfirmCancelar}
          title={`Cancelar o plano de ${petNome ?? "este pet"}?`}
          description={
            assinatura.adicionais.length > 0
              ? "Os créditos restantes deste mês são perdidos e a mensalidade (com os pets adicionais) deixa de entrar no fechamento. Dá pra assinar de novo depois."
              : "Os créditos restantes deste mês são perdidos e a mensalidade deixa de entrar no fechamento. Dá pra assinar de novo depois."
          }
          confirmLabel="Cancelar plano"
          pendingLabel="Cancelando..."
          onConfirm={handleCancelar}
          pending={isPending}
        />
      </>
    );
  }

  if (planos.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem plano. Cadastre planos em Planos.</p>;
  }

  const planoEscolhido = planos.find((p) => p.id === selectedPlano);

  return (
    <div className="flex flex-col gap-2">
      <FormSelect
        value={selectedPlano}
        onValueChange={escolherPlano}
        disabled={isPending}
        placeholder="Sem plano — ativar um plano..."
        className="h-8 text-xs"
        options={planos.map((plano) => ({
          value: plano.id,
          label: plano.nome,
          hint: `${plano.creditos_mes} banho${plano.creditos_mes === 1 ? "" : "s"} por mês · ${formatCentavos(plano.preco_centavos)}`,
        }))}
      />
      {planoEscolhido && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Valor mensal para {petNome ?? "este pet"}</span>
            <span className="w-32">
              <CurrencyInput
                value={precoNovo}
                onChange={(e) => setPrecoNovo(e.target.value)}
                className="h-8 text-xs"
              />
            </span>
          </label>
          <div className="ml-auto flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedPlano("")} disabled={isPending}>
              Voltar
            </Button>
            <Button type="button" size="sm" onClick={handleAssinar} disabled={isPending}>
              {isPending ? "Ativando..." : "Ativar plano"}
            </Button>
          </div>
          <span className="w-full text-[11px] text-muted-foreground">
            Base do plano: {formatCentavos(planoEscolhido.preco_centavos)}. Esse é o valor que entra no
            fechamento do cliente.
          </span>
        </div>
      )}
    </div>
  );
}

function PetsAdicionais({
  assinatura,
  outrosPets,
  adicionando,
  setAdicionando,
  petAdicional,
  setPetAdicional,
  precoAdicional,
  setPrecoAdicional,
  onAdicionar,
  onRemover,
  isPending,
}: {
  assinatura: AssinaturaInfo;
  outrosPets: { id: string; nome: string }[];
  adicionando: boolean;
  setAdicionando: (v: boolean) => void;
  petAdicional: string;
  setPetAdicional: (v: string) => void;
  precoAdicional: string;
  setPrecoAdicional: (v: string) => void;
  onAdicionar: () => void;
  onRemover: (a: AssinaturaInfo["adicionais"][number]) => void;
  isPending: boolean;
}) {
  const jaIncluidos = new Set(assinatura.adicionais.map((a) => a.petId));
  const disponiveis = outrosPets.filter((p) => !jaIncluidos.has(p.id));
  if (assinatura.adicionais.length === 0 && disponiveis.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {assinatura.adicionais.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white/60 px-2.5 py-1.5 text-xs"
        >
          <span>
            <span className="font-medium">{a.petNome}</span>
            <span className="text-muted-foreground"> · pet adicional · {formatCentavos(a.precoCentavos)}/mês</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={isPending}
            onClick={() => onRemover(a)}
            aria-label={`Tirar ${a.petNome} do plano`}
            title="Tirar do plano"
          >
            <X size={12} />
          </Button>
        </div>
      ))}

      {adicionando ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-2">
          <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Pet</span>
            <FormSelect
              value={petAdicional}
              onValueChange={setPetAdicional}
              disabled={isPending}
              placeholder="Escolha o pet..."
              className="h-8 text-xs"
              options={disponiveis.map((p) => ({ value: p.id, label: p.nome }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Valor a mais por mês</span>
            <span className="w-32">
              <CurrencyInput
                value={precoAdicional}
                onChange={(e) => setPrecoAdicional(e.target.value)}
                className="h-8 text-xs"
                placeholder="0,00"
              />
            </span>
          </label>
          <div className="ml-auto flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdicionando(false)} disabled={isPending}>
              Voltar
            </Button>
            <Button type="button" size="sm" onClick={onAdicionar} disabled={isPending || !petAdicional}>
              {isPending ? "Incluindo..." : "Incluir no plano"}
            </Button>
          </div>
          <span className="w-full text-[11px] text-muted-foreground">
            Os {assinatura.creditosMes} banhos do plano passam a ser divididos entre os pets. O valor a mais
            entra no fechamento junto com a mensalidade.
          </span>
        </div>
      ) : (
        disponiveis.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="self-start"
            onClick={() => setAdicionando(true)}
            disabled={isPending}
          >
            <Plus size={12} /> Adicionar pet ao plano
          </Button>
        )
      )}
    </div>
  );
}
