import { DateTime } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { lerEtapa } from "@/lib/painel-dia";
import type { Adicional } from "@/lib/adicionais";
import { PainelDoDia, type CartaoDia } from "./PainelDoDia";

export const metadata = { title: "Hoje · BubblePet" };

const ZONE = "America/Sao_Paulo";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export default async function HojePage() {
  const supabase = await createClient();
  const hoje = DateTime.now().setZone(ZONE).startOf("day");

  const [{ data: ags }, { data: petshop }] = await Promise.all([
    supabase
      .from("agendamentos")
      .select(
        "id, inicio, fim, status, etapa, etapa_em, pronto_avisado_em, origem_plano, adicionais, pets(nome, porte, observacoes, tutores(nome, telefone)), servicos(nome)"
      )
      .gte("inicio", hoje.toUTC().toISO()!)
      .lt("inicio", hoje.plus({ days: 1 }).toUTC().toISO()!)
      .neq("status", "cancelado")
      .order("inicio"),
    supabase.from("petshops").select("whatsapp_status").single(),
  ]);

  const cartoes: CartaoDia[] = (ags ?? []).map((a) => {
    const pet = um(a.pets as Um<{ nome: string; porte: string | null; observacoes: string | null; tutores: Um<{ nome: string; telefone: string }> }>);
    const tutor = um(pet?.tutores);
    return {
      id: a.id,
      inicio: a.inicio,
      fim: a.fim,
      status: a.status,
      etapa: lerEtapa(a.etapa),
      etapaEm: a.etapa_em,
      prontoAvisadoEm: a.pronto_avisado_em,
      plano: a.origem_plano,
      adicionais: ((a.adicionais as Adicional[] | null) ?? []).map((x) => x.descricao),
      petNome: pet?.nome ?? "Pet",
      porte: pet?.porte ?? null,
      observacoes: pet?.observacoes ?? null,
      tutorNome: tutor?.nome ?? "",
      telefone: tutor?.telefone ?? "",
      servicoNome: um(a.servicos as Um<{ nome: string }>)?.nome ?? "Atendimento",
    };
  });

  return (
    <PainelDoDia
      cartoes={cartoes}
      dataLonga={hoje.setLocale("pt-BR").toFormat("cccc, d 'de' LLLL")}
      whatsappConectado={petshop?.whatsapp_status === "conectado"}
    />
  );
}
