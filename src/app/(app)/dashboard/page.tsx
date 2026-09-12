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

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  href: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon size={18} className="text-primary" />
        </CardHeader>
        <CardContent className="flex flex-col gap-0.5">
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

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
  ]);

  const totais = totalizar(base.fechamentos);
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
          <Button nativeButton={false} render={<Link href="/agenda" />}>
            <CalendarPlus size={16} /> Novo agendamento
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CalendarDays}
          label="Hoje na agenda"
          value={String(ativosHoje.length)}
          hint={
            ativosHoje.length === 0
              ? "Nenhum atendimento marcado"
              : `${concluidosHoje} concluído${concluidosHoje === 1 ? "" : "s"}`
          }
          href="/agenda"
        />
        <MetricCard
          icon={Landmark}
          label="Previsto no mês"
          value={formatCentavos(totais.previstoCentavos)}
          hint={`${totais.atendimentos} atendimento${totais.atendimentos === 1 ? "" : "s"} concluído${totais.atendimentos === 1 ? "" : "s"} + mensalidades`}
          href="/financeiro"
        />
        <MetricCard
          icon={Receipt}
          label="A receber"
          value={formatCentavos(emAberto)}
          hint={`${abertos?.length ?? 0} extrato${(abertos?.length ?? 0) === 1 ? "" : "s"} em aberto`}
          href="/financeiro"
        />
        <MetricCard
          icon={Wallet}
          label="Pets com plano"
          value={String(petsComPlano ?? 0)}
          hint={`${consumosMes ?? 0} banho${(consumosMes ?? 0) === 1 ? "" : "s"} de plano este mês · ${tutoresAtivos ?? 0} clientes`}
          href="/planos"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Atendimentos de hoje</CardTitle>
            <Link href="/agenda" className="flex items-center gap-1 text-sm text-primary hover:underline">
              Ver agenda <ChevronRight size={14} />
            </Link>
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
                      <div className="w-12 shrink-0 text-sm font-semibold tabular-nums">
                        {inicio.toFormat("HH:mm")}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {pet?.nome ?? "Pet"} · {servico?.nome ?? "Serviço"}
                          {a.origem_plano && (
                            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
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
            <Link href="/tutores-pets" className="flex items-center gap-3 rounded-[8px] border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted">
              <UserPlus size={16} className="text-primary" />
              <span className="flex-1">Cadastrar cliente e pet</span>
              <ChevronRight size={14} className="text-muted-foreground" />
            </Link>
            <Link href="/agenda" className="flex items-center gap-3 rounded-[8px] border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted">
              <CalendarPlus size={16} className="text-primary" />
              <span className="flex-1">Marcar um banho</span>
              <ChevronRight size={14} className="text-muted-foreground" />
            </Link>
            <Link href="/financeiro" className="flex items-center gap-3 rounded-[8px] border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted">
              <Receipt size={16} className="text-primary" />
              <span className="flex-1">Fechar o mês e enviar extratos</span>
              <ChevronRight size={14} className="text-muted-foreground" />
            </Link>
            <div className="mt-2 rounded-[8px] bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Planos este mês:</span>{" "}
              {totais.atendimentosCobertos} de {totais.atendimentos} atendimentos concluídos foram
              cobertos por plano.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
