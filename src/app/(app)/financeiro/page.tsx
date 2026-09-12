import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { competenciaDe, totalizar } from "@/lib/fechamento/calcular";
import { carregarBaseFechamento } from "@/lib/fechamento/carregar";
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

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const [{ data: rows, error }, base, { data: petshop }] = await Promise.all([
    supabase
      .from("fechamentos")
      .select("id, tutor_id, total_centavos, status, itens, enviado_em, pago_em, atualizado_em, tutores(nome, telefone)")
      .eq("competencia", competencia)
      .order("total_centavos", { ascending: false }),
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

  const totais = totalizar(base.fechamentos);
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
    };
  });

  // Movimento que ainda não virou extrato (ou mudou depois de gerar).
  const porTutor = new Map(fechamentos.map((f) => [f.tutorId, f]));
  const pendentes = base.fechamentos.filter((f) => {
    const existente = porTutor.get(f.tutorId);
    return !existente || (existente.status === "aberto" && existente.totalCentavos !== f.totalCentavos);
  }).length;

  let recebido = 0;
  let emAberto = 0;
  for (const f of fechamentos) {
    if (f.status === "pago") recebido += f.totalCentavos;
    else emAberto += f.totalCentavos;
  }

  return (
    <FinanceiroView
      competencia={competencia}
      fechamentos={fechamentos}
      resumo={{
        previstoCentavos: totais.previstoCentavos,
        recebidoCentavos: recebido,
        emAbertoCentavos: emAberto,
        atendimentos: totais.atendimentos,
        atendimentosCobertos: totais.atendimentosCobertos,
        mensalidadesCentavos: totais.mensalidadesCentavos,
        clientesComMovimento: base.fechamentos.length,
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
