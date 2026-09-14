import "server-only";

import { DateTime } from "luxon";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatCentavos } from "@/lib/currency";
import { formatPhoneBR } from "@/lib/phone";
import type { ItemFechamento } from "@/lib/fechamento/calcular";
import { resumirFechamento } from "@/lib/fechamento/resumo";

const TEAL = "#0d9488";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const SOFT = "#f0faf8";

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: INK },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: TEAL,
    paddingBottom: 10,
    marginBottom: 18,
  },
  petshop: { fontSize: 18, fontFamily: "Helvetica-Bold", color: TEAL },
  petshopSub: { fontSize: 9, color: MUTED, marginTop: 2 },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  tituloSub: { fontSize: 9, color: MUTED, textAlign: "right", marginTop: 2 },
  bloco: { marginBottom: 14 },
  rotulo: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  valor: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  tabela: { borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: "hidden" },
  linha: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE },
  cabecalho: { backgroundColor: SOFT, fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED, textTransform: "uppercase" },
  cData: { width: 80 },
  pet: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  cPet: { width: 90 },
  cDesc: { flex: 1 },
  cValor: { width: 80, textAlign: "right" },
  coberto: { color: TEAL, fontSize: 8 },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: TEAL,
    color: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginTop: 12,
  },
  totalRotulo: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalValor: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  pix: { marginTop: 14, padding: 10, backgroundColor: SOFT, borderRadius: 4 },
  rodape: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: MUTED, textAlign: "center" },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 16 },
  kpi: { flex: 1, padding: 10, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  kpiValor: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  secao: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 8 },
});

function mesExtenso(competencia: string): string {
  const m = DateTime.fromISO(competencia).setLocale("pt-BR").toFormat("LLLL 'de' yyyy");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function hoje(): string {
  return DateTime.now().setZone("America/Sao_Paulo").toFormat("dd/LL/yyyy");
}

export type FechamentoPdfInput = {
  petshop: { nome: string; chave_pix: string | null; telefone: string | null; endereco: string | null };
  tutor: { nome: string; telefone: string };
  competencia: string;
  itens: ItemFechamento[];
  totalCentavos: number;
  status: "aberto" | "pago";
};

function FechamentoTutorPdf({ dados }: { dados: FechamentoPdfInput }) {
  const resumo = resumirFechamento(dados.itens);
  const ano = DateTime.fromISO(dados.competencia).toFormat("yyyy");
  const subtitulo = resumo.periodo
    ? resumo.periodo.inicio === resumo.periodo.fim
      ? `${resumo.periodo.inicio}/${ano}`
      : `${resumo.periodo.inicio} a ${resumo.periodo.fim}/${ano}`
    : mesExtenso(dados.competencia);
  const tudoBanho = resumo.pets.every((p) => p.servicos.every((sv) => sv.nome.toLowerCase().includes("banho")));
  const palavra = (n: number) =>
    tudoBanho ? `banho${n === 1 ? "" : "s"}` : `atendimento${n === 1 ? "" : "s"}`;

  return (
    <Document title={`Fechamento ${subtitulo} — ${dados.tutor.nome}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.petshop}>{dados.petshop.nome}</Text>
            <Text style={s.petshopSub}>
              {[dados.petshop.endereco, dados.petshop.telefone && formatPhoneBR(dados.petshop.telefone)]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <View>
            <Text style={s.titulo}>Fechamento</Text>
            <Text style={s.tituloSub}>{subtitulo}</Text>
          </View>
        </View>

        <View style={[s.bloco, { flexDirection: "row", gap: 24 }]}>
          <View>
            <Text style={s.rotulo}>Cliente</Text>
            <Text style={s.valor}>{dados.tutor.nome}</Text>
          </View>
          <View>
            <Text style={s.rotulo}>Situação</Text>
            <Text style={[s.valor, { color: dados.status === "pago" ? TEAL : INK }]}>
              {dados.status === "pago" ? "Pago" : "Em aberto"}
            </Text>
          </View>
        </View>

        {resumo.pets.map((pet) => (
          <View key={pet.petNome} style={{ marginBottom: 12 }} wrap={false}>
            <Text style={s.pet}>{pet.petNome}</Text>
            <View style={s.tabela}>
              <View style={[s.linha, s.cabecalho]}>
                <Text style={s.cData}>Data</Text>
                <Text style={s.cDesc}>Serviço</Text>
                <Text style={s.cValor}>Valor</Text>
              </View>
              {pet.servicos.flatMap((sv) =>
                sv.datas.map((d, idx) => (
                  <View key={`${sv.nome}-${idx}`} style={s.linha}>
                    <Text style={s.cData}>
                      {d.data} <Text style={{ color: MUTED }}>{d.diaSemana}</Text>
                    </Text>
                    <Text style={s.cDesc}>{sv.nome}</Text>
                    <Text style={[s.cValor, d.coberto ? { color: TEAL } : {}]}>
                      {d.coberto ? "incluso no plano" : formatCentavos(d.valorCentavos)}
                    </Text>
                  </View>
                ))
              )}
              {pet.mensalidades.map((m, idx) => (
                <View key={`m-${idx}`} style={s.linha}>
                  <Text style={s.cData}>—</Text>
                  <Text style={s.cDesc}>{m.descricao}</Text>
                  <Text style={s.cValor}>{formatCentavos(m.valorCentavos)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {resumo.pets.length === 0 && (
          <Text style={{ color: MUTED, marginBottom: 12 }}>Sem movimentação neste período.</Text>
        )}

        <View style={s.total}>
          <Text style={s.totalRotulo}>
            {resumo.totalBanhos > 0 ? `Foram ${resumo.totalBanhos} ${palavra(resumo.totalBanhos)}` : "Total"}
          </Text>
          <Text style={s.totalValor}>{formatCentavos(dados.totalCentavos)}</Text>
        </View>

        {dados.status !== "pago" && dados.totalCentavos > 0 && (
          <View style={s.pix}>
            <Text style={s.rotulo}>Como pagar</Text>
            {dados.petshop.chave_pix ? (
              <>
                <Text>Pix para a chave:</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 2 }}>
                  {dados.petshop.chave_pix}
                </Text>
                <Text style={{ color: MUTED, marginTop: 4 }}>
                  Depois de pagar, é só mandar o comprovante pelo WhatsApp.
                </Text>
              </>
            ) : (
              <Text>Combine o pagamento direto com o petshop.</Text>
            )}
          </View>
        )}

        <Text style={{ marginTop: 18, color: MUTED }}>
          Obrigado por cuidar do seu pet com a gente!
        </Text>

        <Text style={s.rodape}>Gerado pelo BubblePet em {hoje()}</Text>
      </Page>
    </Document>
  );
}

export type RelatorioPdfInput = {
  petshop: { nome: string };
  competencia: string;
  previstoCentavos: number;
  recebidoCentavos: number;
  emAbertoCentavos: number;
  mensalidadesCentavos: number;
  atendimentos: number;
  atendimentosCobertos: number;
  planosAtivos: number;
  novosTutores: number;
  creditosConsumidos: number;
  porServico: { nome: string; quantidade: number; valorCentavos: number }[];
  porTutor: { nome: string; totalCentavos: number; status: "aberto" | "pago" | "nao_gerado" }[];
};

const STATUS_TUTOR: Record<RelatorioPdfInput["porTutor"][number]["status"], string> = {
  aberto: "Em aberto",
  pago: "Pago",
  nao_gerado: "Não fechado",
};

function RelatorioMensalPdf({ dados }: { dados: RelatorioPdfInput }) {
  return (
    <Document title={`Relatório ${mesExtenso(dados.competencia)} — ${dados.petshop.nome}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.petshop}>{dados.petshop.nome}</Text>
            <Text style={s.petshopSub}>Relatório gerencial</Text>
          </View>
          <View>
            <Text style={s.titulo}>{mesExtenso(dados.competencia)}</Text>
            <Text style={s.tituloSub}>gerado em {hoje()}</Text>
          </View>
        </View>

        <View style={s.kpis}>
          <View style={s.kpi}>
            <Text style={s.rotulo}>Movimento do mês</Text>
            <Text style={s.kpiValor}>{formatCentavos(dados.previstoCentavos)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.rotulo}>Recebido</Text>
            <Text style={[s.kpiValor, { color: TEAL }]}>{formatCentavos(dados.recebidoCentavos)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.rotulo}>Em aberto</Text>
            <Text style={s.kpiValor}>{formatCentavos(dados.emAbertoCentavos)}</Text>
          </View>
        </View>

        <View style={s.kpis}>
          <View style={s.kpi}>
            <Text style={s.rotulo}>Atendimentos realizados</Text>
            <Text style={s.kpiValor}>{dados.atendimentos}</Text>
            <Text style={{ color: MUTED }}>{dados.atendimentosCobertos} coberto{dados.atendimentosCobertos === 1 ? "" : "s"} por plano</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.rotulo}>Planos ativos</Text>
            <Text style={s.kpiValor}>{dados.planosAtivos}</Text>
            <Text style={{ color: MUTED }}>{formatCentavos(dados.mensalidadesCentavos)} em mensalidades</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.rotulo}>Novos clientes</Text>
            <Text style={s.kpiValor}>{dados.novosTutores}</Text>
            <Text style={{ color: MUTED }}>{dados.creditosConsumidos} crédito{dados.creditosConsumidos === 1 ? "" : "s"} usado{dados.creditosConsumidos === 1 ? "" : "s"}</Text>
          </View>
        </View>

        <Text style={s.secao}>Por serviço</Text>
        <View style={s.tabela}>
          <View style={[s.linha, s.cabecalho]}>
            <Text style={s.cDesc}>Serviço</Text>
            <Text style={s.cPet}>Atendimentos</Text>
            <Text style={s.cValor}>Valor</Text>
          </View>
          {dados.porServico.map((r) => (
            <View key={r.nome} style={s.linha}>
              <Text style={s.cDesc}>{r.nome}</Text>
              <Text style={s.cPet}>{r.quantidade}</Text>
              <Text style={s.cValor}>{formatCentavos(r.valorCentavos)}</Text>
            </View>
          ))}
          {dados.porServico.length === 0 && (
            <View style={s.linha}>
              <Text style={{ color: MUTED }}>Nenhum atendimento realizado no mês.</Text>
            </View>
          )}
        </View>

        <Text style={s.secao}>Por cliente</Text>
        <View style={s.tabela}>
          <View style={[s.linha, s.cabecalho]}>
            <Text style={s.cDesc}>Cliente</Text>
            <Text style={s.cPet}>Situação</Text>
            <Text style={s.cValor}>Total</Text>
          </View>
          {dados.porTutor.map((r) => (
            <View key={r.nome} style={s.linha}>
              <Text style={s.cDesc}>{r.nome}</Text>
              <Text style={[s.cPet, { color: r.status === "pago" ? TEAL : INK }]}>{STATUS_TUTOR[r.status]}</Text>
              <Text style={s.cValor}>{formatCentavos(r.totalCentavos)}</Text>
            </View>
          ))}
        </View>

        <Text style={s.rodape}>Gerado pelo BubblePet em {hoje()}</Text>
      </Page>
    </Document>
  );
}

export async function renderFechamentoPdf(dados: FechamentoPdfInput): Promise<Buffer> {
  return renderToBuffer(<FechamentoTutorPdf dados={dados} />);
}

export async function renderRelatorioPdf(dados: RelatorioPdfInput): Promise<Buffer> {
  return renderToBuffer(<RelatorioMensalPdf dados={dados} />);
}

export function nomeArquivoExtrato(competencia: string, tutorNome: string): string {
  const mes = DateTime.fromISO(competencia).toFormat("yyyy-LL");
  const nome = tutorNome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `fechamento-${mes}-${nome || "cliente"}.pdf`;
}
