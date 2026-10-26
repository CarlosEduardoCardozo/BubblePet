import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { carregarRetornos } from "@/lib/retorno/carregar";
import { OportunidadesView, type Linha } from "./OportunidadesView";

export const metadata = { title: "Oportunidades · BubblePet" };

export default async function OportunidadesPage() {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const dados = await carregarRetornos(supabase, petshopId);

  const mensagem = (petId: string) => {
    const m = dados.ultimaMensagem.get(petId);
    return m ? { status: m.status, tipo: m.tipo, agendadaPara: m.agendadaPara, enviadaEm: m.enviadaEm, erro: m.erro } : null;
  };

  const linhas: Linha[] = [
    ...dados.retornos.map((r) => ({
      grupo: r.categoria,
      petId: r.petId,
      petNome: r.petNome,
      tutorNome: r.tutorNome,
      pausado: r.pausado,
      intervaloDias: r.intervaloDias,
      intervaloEstimado: r.intervaloEstimado,
      visitas: r.visitas,
      ultimaVisita: r.ultimaVisita,
      diasDesdeUltima: r.diasDesdeUltima,
      proxima: r.proxima,
      diasParaVoltar: r.diasParaVoltar,
      avisoPrevisto: r.avisoPrevisto,
      servicoNome: r.servicoNome,
      valorCentavos: r.valorCentavos,
      plano: null,
      mensagem: mensagem(r.petId),
    })),
    ...dados.planosSobrando.map((p) => {
      const r = dados.retornos.find((x) => x.petId === p.petId);
      return {
        grupo: "plano_sobrando" as const,
        petId: p.petId,
        petNome: p.petNome,
        tutorNome: p.tutorNome,
        pausado: p.pausado,
        intervaloDias: r?.intervaloDias ?? null,
        intervaloEstimado: r?.intervaloEstimado ?? true,
        visitas: r?.visitas ?? 0,
        ultimaVisita: r?.ultimaVisita ?? null,
        diasDesdeUltima: r?.diasDesdeUltima ?? null,
        proxima: r?.proxima ?? null,
        diasParaVoltar: r?.diasParaVoltar ?? null,
        avisoPrevisto: null,
        servicoNome: r?.servicoNome ?? "banho",
        valorCentavos: 0,
        plano: { nome: p.planoNome, saldo: p.saldo, creditosMes: p.creditosMes },
        mensagem: mensagem(p.petId),
      };
    }),
  ];

  return (
    <OportunidadesView
      linhas={linhas}
      config={dados.config}
      whatsappConectado={dados.whatsappConectado}
      voltaram={dados.voltaram}
    />
  );
}
