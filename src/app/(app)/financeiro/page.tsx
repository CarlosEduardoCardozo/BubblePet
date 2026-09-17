import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { competenciaDe, totalizar, ZONE } from "@/lib/fechamento/calcular";
import { carregarBaseFechamento, carregarPendencias } from "@/lib/fechamento/carregar";
import { PageHeader } from "@/components/shared/PageHeader";
import { FinanceiroView, type FechamentoRow } from "./FinanceiroView";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia =
    mes && /^\d{4}-\d{2}$/.test(mes) && DateTime.fromISO(`${mes}-01`).isValid
      ? `${mes}-01`
      : competenciaDe();

  const agora = DateTime.now().setZone(ZONE);
  const fimMes = DateTime.fromISO(competencia, { zone: ZONE }).endOf("month");
  const corte = (fimMes < agora ? fimMes : agora).toUTC().toISO()!;

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const [{ data: rows, error }, { data: rascunhos }, { data: aguardando }, base, { data: petshop }] =
    await Promise.all([
      supabase
        .from("fechamentos")
        .select(
          "id, tutor_id, total_centavos, status, itens, enviado_em, pago_em, periodo_inicio, periodo_fim, tutores(nome, telefone)"
        )
        .eq("competencia", competencia)
        .order("criado_em", { ascending: false }),
      supabase
        .from("fechamentos")
        .select("id, tutor_id, total_centavos")
        .eq("status", "aberto")
        .is("enviado_em", null),
      supabase
        .from("fechamentos")
        .select("total_centavos")
        .eq("status", "aberto")
        .not("enviado_em", "is", null),
      carregarBaseFechamento(supabase, petshopId, competencia),
      supabase
        .from("petshops")
        .select("chave_pix, telefone, whatsapp_status")
        .eq("id", petshopId)
        .single(),
    ]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Financeiro" />
        <p className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Não foi possível carregar o financeiro. Recarregue a página.
        </p>
      </div>
    );
  }

  const { pendencias } = await carregarPendencias(supabase, petshopId, {
    competencia,
    corte,
    rascunhoIds: (rascunhos ?? []).map((r) => r.id),
  });

  // Cliente com algo novo desde o extrato (inclusive banho do plano, R$ 0).
  const comNovidade = new Set(
    pendencias.filter((p) => p.agendamentoIds.length > 0 || p.totalCentavos > 0).map((p) => p.tutorId)
  );
  const rascunhoDoTutor = new Set((rascunhos ?? []).map((r) => r.tutor_id));
  const abertosPorTutor = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.status === "aberto") abertosPorTutor.set(r.tutor_id, (abertosPorTutor.get(r.tutor_id) ?? 0) + 1);
  }

  const fechamentos: FechamentoRow[] = (rows ?? []).map((r) => {
    const tutor = um(r.tutores as Um<{ nome: string; telefone: string }>);
    const itens = (r.itens as { tipo: string }[]) ?? [];
    return {
      id: r.id,
      tutorId: r.tutor_id,
      tutorNome: tutor?.nome ?? "Cliente",
      tutorTelefone: tutor?.telefone ?? "",
      totalCentavos: r.total_centavos,
      status: r.status as "aberto" | "pago",
      servicos: itens.filter((i) => i.tipo === "servico").length,
      mensalidades: itens.filter((i) => i.tipo === "mensalidade").length,
      enviadoEm: r.enviado_em,
      pagoEm: r.pago_em,
      periodoInicio: r.periodo_inicio,
      periodoFim: r.periodo_fim,
      extratosAbertosDoCliente: abertosPorTutor.get(r.tutor_id) ?? 0,
      novidadesDepoisDoEnvio:
        r.status === "aberto" && !!r.enviado_em && comNovidade.has(r.tutor_id) && !rascunhoDoTutor.has(r.tutor_id),
    };
  });

  // O que mudou desde o último "gerar": cliente com algo a cobrar e sem
  // rascunho, ou com rascunho desatualizado.
  const rascunhoPorTutor = new Map((rascunhos ?? []).map((r) => [r.tutor_id, r.total_centavos]));
  const aCobrar = pendencias.filter((p) => p.totalCentavos > 0);
  const pendentes = aCobrar.filter((p) => rascunhoPorTutor.get(p.tutorId) !== p.totalCentavos).length;

  const totais = totalizar(base.fechamentos);
  const recebido = fechamentos.filter((f) => f.status === "pago").reduce((s, f) => s + f.totalCentavos, 0);

  return (
    <FinanceiroView
      competencia={competencia}
      fechamentos={fechamentos}
      resumo={{
        aFecharCentavos: aCobrar.reduce((s, p) => s + p.totalCentavos, 0),
        clientesAFechar: aCobrar.length,
        aguardandoCentavos: (aguardando ?? []).reduce((s, f) => s + f.total_centavos, 0),
        extratosAguardando: (aguardando ?? []).length,
        recebidoCentavos: recebido,
        atendimentosNoMes: totais.atendimentos,
        atendimentosCobertos: totais.atendimentosCobertos,
        pendentes,
      }}
      petshop={{
        temPix: !!petshop?.chave_pix,
        temTelefone: !!petshop?.telefone,
        whatsappConectado: petshop?.whatsapp_status === "conectado",
      }}
    />
  );
}
