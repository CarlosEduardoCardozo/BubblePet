import Link from "next/link";
import { DateTime } from "luxon";
import {
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Landmark,
  Receipt,
  UserPlus,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { acessoAtual, pode } from "@/lib/acesso";
import { MODULOS } from "@/lib/permissoes";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { formatCentavos } from "@/lib/currency";
import { competenciaDe } from "@/lib/fechamento/calcular";
import { carregarBaseFechamento } from "@/lib/fechamento/carregar";
import { totalizar } from "@/lib/fechamento/calcular";
import type { AgendamentoStatus } from "@/lib/agendamento";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LembreteButton } from "@/components/agenda/LembreteButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ZONE = "America/Sao_Paulo";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

const TOM_CARD = {
  // Card de destaque: degradê roxo, número grande em branco.
  roxo: { card: "bg-brand", icone: "bg-white/20 text-white", hint: "text-white/80", label: "text-white" },
  amarelo: { card: "glass", icone: "bg-sun", hint: "text-muted-foreground", label: "text-foreground" },
  lilas: { card: "glass", icone: "bg-secondary text-primary", hint: "text-muted-foreground", label: "text-foreground" },
} as const;

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  tom = "lilas",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  href: string;
  tom?: keyof typeof TOM_CARD;
}) {
  const t = TOM_CARD[tom];
  return (
    <Link
      href={href}
      className={`group relative flex min-h-36 flex-col justify-between gap-4 overflow-hidden rounded-card p-5 transition-transform sm:min-h-44 duration-300 hover:-translate-y-0.5 ${t.card}`}
    >
      {tom === "roxo" && (
        <div className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-[#ffc21a]/35 blur-2xl" />
      )}
      <div className="relative flex items-center justify-between">
        <span className={`text-sm font-bold ${t.label}`}>{label}</span>
        <span className={`flex size-9 items-center justify-center rounded-full ${t.icone}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="relative flex flex-col gap-1">
        <div className="text-4xl font-extrabold tracking-tight tabular-nums">{value}</div>
        {hint && <div className={`text-xs font-medium ${t.hint}`}>{hint}</div>}
      </div>
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sem_acesso?: string }>;
}) {
  const { sem_acesso: semAcesso } = await searchParams;
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const acesso = await acessoAtual();
  const verFinanceiro = pode(acesso, "financeiro");
  const verAgenda = pode(acesso, "agenda");
  const verClientes = pode(acesso, "clientes");

  const agora = DateTime.now().setZone(ZONE);
  const inicioHoje = agora.startOf("day");
  const fimHoje = inicioHoje.plus({ days: 1 });
  const competencia = competenciaDe(agora);

  const [
    { data: hoje, error: erroHoje },
    base,
    { data: abertos },
    { count: petsComPlano },
    { count: consumosMes },
    { count: tutoresAtivos },
    { count: petsAdicionais },
  ] = await Promise.all([
    supabase
      .from("agendamentos")
      .select(
        "id, inicio, fim, status, origem_plano, pets(nome, tutores(nome, telefone)), servicos(nome)"
      )
      .gte("inicio", inicioHoje.toUTC().toISO()!)
      .lt("inicio", fimHoje.toUTC().toISO()!)
      .order("inicio"),
    carregarBaseFechamento(supabase, petshopId, competencia),
    supabase.from("fechamentos").select("total_centavos").eq("status", "aberto"),
    supabase
      .from("assinaturas")
      .select("id", { count: "exact", head: true })
      .eq("status", "ativa"),
    supabase
      .from("creditos_movimentos")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "consumo")
      .eq("competencia", competencia),
    supabase
      .from("tutores")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true),
    supabase
      .from("assinatura_pets_adicionais")
      .select("id, assinaturas!inner(status)", { count: "exact", head: true })
      .eq("assinaturas.status", "ativa"),
  ]);

  const totais = totalizar(base.fechamentos);
  const areaNegada = semAcesso
    ? (MODULOS.find((m) => m.valor === semAcesso)?.label ?? (semAcesso === "equipe" ? "Equipe" : null))
    : null;
  const emAberto = (abertos ?? []).reduce((s, f) => s + f.total_centavos, 0);
  const agendamentosHoje = hoje ?? [];
  const concluidosHoje = agendamentosHoje.filter((a) => a.status === "concluido").length;
  const ativosHoje = agendamentosHoje.filter((a) => a.status !== "cancelado");

  const dataLonga = agora.setLocale("pt-BR").toFormat("cccc, d 'de' LLLL");
  const saudacao = agora.hour < 12 ? "Bom dia" : agora.hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${saudacao}!`}
        description={dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)}
        action={
          verAgenda ? (
            <Button nativeButton={false} render={<Link href="/agenda" />}>
              <CalendarPlus size={16} /> Novo agendamento
            </Button>
          ) : undefined
        }
      />

      {areaNegada && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Seu usuário não tem acesso a <strong>{areaNegada}</strong>. Se precisar, peça pro dono do
          petshop liberar em Equipe.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CalendarDays}
          tom="roxo"
          label="Hoje na agenda"
          value={String(ativosHoje.length)}
          hint={
            ativosHoje.length === 0
              ? "Nenhum atendimento marcado"
              : `${concluidosHoje} concluído${concluidosHoje === 1 ? "" : "s"}`
          }
          href={verAgenda ? "/agenda" : "/dashboard"}
        />
        {verFinanceiro && (
          <>
            <MetricCard
              icon={Landmark}
              label="Movimento do mês"
              value={formatCentavos(totais.previstoCentavos)}
              hint={`${totais.atendimentos} atendimento${totais.atendimentos === 1 ? "" : "s"} realizado${totais.atendimentos === 1 ? "" : "s"} + mensalidades`}
              href="/financeiro"
            />
            <MetricCard
              icon={Receipt}
              tom="amarelo"
              label="A receber"
              value={formatCentavos(emAberto)}
              hint={`${abertos?.length ?? 0} extrato${(abertos?.length ?? 0) === 1 ? "" : "s"} em aberto`}
              href="/financeiro"
            />
          </>
        )}
        <MetricCard
          icon={Wallet}
          label="Pets com plano"
          value={String((petsComPlano ?? 0) + (petsAdicionais ?? 0))}
          hint={`${consumosMes ?? 0} banho${(consumosMes ?? 0) === 1 ? "" : "s"} de plano este mês · ${tutoresAtivos ?? 0} clientes`}
          href={pode(acesso, "planos") ? "/planos" : verClientes ? "/tutores-pets" : "/dashboard"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Atendimentos de hoje</CardTitle>
            {verAgenda && (
              <Link href="/agenda" className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-white">
                Ver agenda <ChevronRight size={14} />
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {erroHoje ? (
              <p className="text-sm text-destructive">Não foi possível carregar a agenda de hoje.</p>
            ) : ativosHoje.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Agenda livre hoje"
                description="Nenhum atendimento marcado. Que tal avisar os clientes com plano que ainda têm banho este mês?"
                action={
                  <Button variant="outline" nativeButton={false} render={<Link href="/agenda" />}>
                    Abrir agenda
                  </Button>
                }
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <ul className="divide-y divide-border">
                {ativosHoje.map((a) => {
                  const pet = um(a.pets as Um<{ nome: string; tutores: Um<{ nome: string; telefone: string }> }>);
                  const tutor = um(pet?.tutores);
                  const servico = um(a.servicos as Um<{ nome: string }>);
                  const inicio = DateTime.fromISO(a.inicio).setZone(ZONE);
                  const podeLembrar = a.status === "agendado" || a.status === "confirmado";
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-sm font-bold text-primary tabular-nums">
                        {inicio.toFormat("HH:mm")}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {pet?.nome ?? "Pet"} · {servico?.nome ?? "Serviço"}
                          {a.origem_plano && (
                            <span className="ml-1.5 rounded-full bg-sun px-1.5 py-0.5 text-[10px] font-bold">
                              plano
                            </span>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{tutor?.nome}</span>
                      </div>
                      <StatusBadge status={a.status as AgendamentoStatus} />
                      {podeLembrar && (
                        <div className="hidden sm:block">
                          <LembreteButton agendamentoId={a.id} size="xs" variant="ghost" label="Lembrar" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atalhos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {verClientes && (
              <Link href="/tutores-pets" className="flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-white">
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary"><UserPlus size={15} /></span>
                <span className="flex-1">Cadastrar cliente e pet</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </Link>
            )}
            {verAgenda && (
              <Link href="/agenda" className="flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-white">
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary"><CalendarPlus size={15} /></span>
                <span className="flex-1">Marcar um banho</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </Link>
            )}
            {verFinanceiro && (
              <Link href="/financeiro" className="flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-white">
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary"><Receipt size={15} /></span>
                <span className="flex-1">Fechar o mês e enviar extratos</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </Link>
            )}
            <div className="mt-2 rounded-2xl border border-[#ffc21a]/40 bg-[#ffc21a]/12 px-3.5 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Planos este mês:</span>{" "}
              {totais.atendimentosCobertos} de {totais.atendimentos} atendimentos realizados foram
              cobertos por plano.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
