import { DateTime } from "luxon";
import { formatCentavos } from "@/lib/currency";
import type { ResumoFechamento } from "@/lib/fechamento/resumo";
import type { Adicional } from "@/lib/adicionais";
import { renderizarModelo, textoDoModelo } from "@/lib/mensagens/modelos";

const ZONE = "America/Sao_Paulo";

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function saudacao(): string {
  const hora = DateTime.now().setZone(ZONE).hour;
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

function dataHora(iso: string): { data: string; hora: string; dia_semana: string } {
  const dt = DateTime.fromISO(iso).setZone(ZONE).setLocale("pt-BR");
  return {
    data: dt.toFormat("dd/LL"),
    hora: dt.toFormat("HH:mm"),
    dia_semana: dt.toFormat("cccc"),
  };
}

/** Dados comuns do petshop e do texto personalizado (petshops.modelos_mensagem). */
type Petshop = { nome: string; endereco?: string | null; modelos?: unknown };

function base(petshop: Petshop, tutorNome: string) {
  return {
    saudacao: saudacao(),
    tutor: primeiroNome(tutorNome),
    petshop: petshop.nome,
    endereco: petshop.endereco ?? "",
  };
}

export function templateTeste(petshopNome: string): string {
  return `✅ *${petshopNome}* conectado ao BubblePet!\n\nEsta é uma mensagem de teste. A partir de agora seus clientes receberão lembretes, confirmações e o fechamento do mês por aqui.`;
}

/** Fixo: o código precisa estar sempre lá, do mesmo jeito. */
export function templateOtp(petshopNome: string, codigo: string): string {
  return `Seu código para agendar em *${petshopNome}* é *${codigo}*.\n\nEle vale por 5 minutos. Se você não pediu esse código, ignore esta mensagem.`;
}

/** Linha de rodapé dos botões: funciona mesmo se o celular esconder os botões. */
export const RODAPE_BOTOES = "Ou responda 1 para confirmar, 2 para cancelar.";

export function templateConfirmacao(args: {
  petshop: Petshop;
  tutorNome: string;
  petNome: string;
  servicoNome: string;
  inicioISO: string;
  valorCentavos: number;
  planoNome?: string | null;
  adicionais?: Adicional[];
}): string {
  const extras = args.adicionais ?? [];
  const totalExtras = extras.reduce((s, a) => s + a.valorCentavos, 0);
  let valor: string;
  if (args.planoNome) {
    valor =
      totalExtras > 0
        ? `Banho coberto pelo plano *${args.planoNome}*. Adicionais: *${formatCentavos(totalExtras)}*.`
        : `Coberto pelo plano *${args.planoNome}* — sem custo.`;
  } else {
    valor = `Valor: *${formatCentavos(args.valorCentavos + totalExtras)}*.`;
  }
  return renderizarModelo(textoDoModelo("confirmacao", args.petshop.modelos), {
    ...base(args.petshop, args.tutorNome),
    ...dataHora(args.inicioISO),
    pet: args.petNome,
    servico: args.servicoNome,
    valor,
    adicionais: extras.map((a) => `• + ${a.descricao}: ${formatCentavos(a.valorCentavos)}`).join("\n"),
  });
}

export function templateLembrete(args: {
  petshop: Petshop;
  tutorNome: string;
  petNome: string;
  servicoNome: string;
  inicioISO: string;
}): string {
  return renderizarModelo(textoDoModelo("lembrete", args.petshop.modelos), {
    ...base(args.petshop, args.tutorNome),
    ...dataHora(args.inicioISO),
    pet: args.petNome,
    servico: args.servicoNome,
  });
}

export function templateRespostaConfirmado(args: {
  petshop: Petshop;
  tutorNome: string;
  petNome: string;
  inicioISO: string;
}): string {
  return renderizarModelo(textoDoModelo("resposta_confirmado", args.petshop.modelos), {
    ...base(args.petshop, args.tutorNome),
    ...dataHora(args.inicioISO),
    pet: args.petNome,
  });
}

export function templateRespostaCancelado(args: {
  petshop: Petshop;
  tutorNome: string;
  petNome: string;
  inicioISO: string;
  linkAgendar?: string;
}): string {
  return renderizarModelo(textoDoModelo("resposta_cancelado", args.petshop.modelos), {
    ...base(args.petshop, args.tutorNome),
    ...dataHora(args.inicioISO),
    pet: args.petNome,
    link_agendar: args.linkAgendar ?? "é só responder por aqui",
  });
}

function linhaData(d: { data: string; diaSemana: string; adicionais: Adicional[] }, valor?: string): string {
  const extras = d.adicionais.map((a) => ` + ${a.descricao} ${formatCentavos(a.valorCentavos)}`).join("");
  return `• ${d.data} (${d.diaSemana})${valor ? ` — ${valor}` : ""}${extras}`;
}

/**
 * Bloco {detalhes} do fechamento: por pet, o plano (mensalidade + as datas
 * dos banhos que ele cobriu) e os banhos cobrados à parte — "a mais" quando o
 * pet tem plano daquele serviço. Tudo num extrato só.
 */
export function detalhesFechamento(resumo: ResumoFechamento): string {
  const blocos: string[] = [];
  const variosPetsOuServicos =
    resumo.pets.length > 1 || resumo.pets.some((p) => p.servicos.length + p.planos.length > 1);

  for (const pet of resumo.pets) {
    const linhas: string[] = [];
    const semPlano = pet.planos.length === 0;

    if (!semPlano) linhas.push(`*${pet.petNome}*`);
    for (const plano of pet.planos) {
      linhas.push(
        plano.mensalidade
          ? `📋 *${plano.nome}* — mensalidade: ${formatCentavos(plano.mensalidade.valorCentavos)}`
          : `📋 *${plano.nome}*`
      );
      if (plano.banhos.length > 0) {
        const cota = plano.creditosMes ? ` de ${plano.creditosMes}` : "";
        const palavra = (plano.servicoNome ?? "banho").toLowerCase().includes("banho") ? "Banhos" : "Atendimentos";
        linhas.push(`${palavra} do plano (${plano.banhos.length}${cota}):`);
        for (const d of plano.banhos) linhas.push(linhaData(d));
      }
    }

    for (const s of pet.servicos) {
      if (s.alemDoPlano) {
        const n = s.quantidade;
        linhas.push(`${n === 1 ? `${s.nome} a mais` : `${s.nome}s a mais`}, fora do plano:`);
        for (const d of s.datas) linhas.push(linhaData(d, formatCentavos(d.valorCentavos)));
      } else {
        linhas.push(semPlano ? `*${pet.petNome}* — ${s.nome}` : s.nome);
        for (const d of s.datas) linhas.push(linhaData(d));
        if (variosPetsOuServicos) {
          linhas.push(
            s.valorUnitarioCentavos != null
              ? `${s.quantidade} × ${formatCentavos(s.valorUnitarioCentavos)} = ${formatCentavos(s.subtotalCentavos)}`
              : `Subtotal: ${formatCentavos(s.subtotalCentavos)}`
          );
        }
      }
    }
    for (const o of pet.outros) linhas.push(`${o.descricao}: ${formatCentavos(o.valorCentavos)}`);
    blocos.push(linhas.join("\n"));
  }
  return blocos.join("\n\n");
}

/** Bloco {resumo}: "Foram 5 banhos: 4 pelo plano e 1 a mais" + adicionais. */
export function resumoFechamentoTexto(resumo: ResumoFechamento): string {
  const grupos = resumo.pets.flatMap((p) => [
    ...p.servicos.map((s) => s.nome),
    ...p.planos.map((pl) => pl.servicoNome ?? "banho"),
  ]);
  const tudoBanho = grupos.every((n) => n.toLowerCase().includes("banho"));
  const palavra = (n: number) =>
    tudoBanho ? `banho${n === 1 ? "" : "s"}` : `atendimento${n === 1 ? "" : "s"}`;

  const linhas: string[] = [];
  if (resumo.totalBanhos > 0) {
    if (resumo.banhosPlano > 0 && resumo.banhosAvulsos > 0) {
      linhas.push(
        `Foram ${resumo.totalBanhos} ${palavra(resumo.totalBanhos)}: ${resumo.banhosPlano} pelo plano e ${resumo.banhosAvulsos} a mais`
      );
    } else if (resumo.banhosPlano > 0) {
      linhas.push(`Foram ${resumo.totalBanhos} ${palavra(resumo.totalBanhos)}, todos pelo plano`);
    } else {
      const unico = resumo.pets.length === 1 && resumo.pets[0].servicos.length === 1 ? resumo.pets[0].servicos[0] : null;
      const cada = unico?.valorUnitarioCentavos != null ? ` · ${formatCentavos(unico.valorUnitarioCentavos)} cada` : "";
      linhas.push(`Foram ${resumo.totalBanhos} ${palavra(resumo.totalBanhos)}${cada}`);
    }
  }
  if (resumo.totalAdicionaisCentavos > 0) {
    linhas.push(`Adicionais: ${formatCentavos(resumo.totalAdicionaisCentavos)}`);
  }
  return linhas.join("\n");
}

/**
 * Mensagem do fechamento no formato que o petshop já usa ("Segue fechamento /
 * Banhos 04/08 25/08 / Foram 3 banhos / Total"), com o plano explicado.
 */
export function templateFechamento(args: {
  petshop: Petshop;
  tutorNome: string;
  resumo: ResumoFechamento;
  chavePix: string | null;
}): string {
  const { resumo } = args;
  return renderizarModelo(textoDoModelo("fechamento", args.petshop.modelos), {
    ...base(args.petshop, args.tutorNome),
    detalhes: detalhesFechamento(resumo),
    resumo: resumoFechamentoTexto(resumo),
    total: formatCentavos(resumo.totalCentavos),
    pix: args.chavePix ? `💳 Pix: ${args.chavePix}` : "",
    periodo: resumo.periodo
      ? resumo.periodo.inicio === resumo.periodo.fim
        ? resumo.periodo.inicio
        : `${resumo.periodo.inicio} a ${resumo.periodo.fim}`
      : "",
  });
}

export function templateRelatorio(args: {
  petshopNome: string;
  competencia: string;
  faturamentoCentavos: number;
  atendimentos: number;
  planosAtivos: number;
}): string {
  const mes = DateTime.fromISO(args.competencia).setLocale("pt-BR").toFormat("LLLL 'de' yyyy");
  return `📊 *Relatório de ${mes}* — ${args.petshopNome}\n\n• Movimento do mês: *${formatCentavos(args.faturamentoCentavos)}*\n• Atendimentos realizados: *${args.atendimentos}*\n• Planos ativos: *${args.planosAtivos}*\n\nO PDF completo segue em anexo.`;
}
