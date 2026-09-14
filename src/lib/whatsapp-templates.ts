import { DateTime } from "luxon";
import { formatCentavos } from "@/lib/currency";
import type { ResumoFechamento } from "@/lib/fechamento/resumo";

const ZONE = "America/Sao_Paulo";

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function saudacao(): string {
  const hora = DateTime.now().setZone(ZONE).hour;
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

function dataHora(iso: string): { data: string; hora: string; diaSemana: string } {
  const dt = DateTime.fromISO(iso).setZone(ZONE).setLocale("pt-BR");
  return {
    data: dt.toFormat("dd/LL"),
    hora: dt.toFormat("HH:mm"),
    diaSemana: dt.toFormat("cccc"),
  };
}

export function templateTeste(petshopNome: string): string {
  return `✅ *${petshopNome}* conectado ao BubblePet!\n\nEsta é uma mensagem de teste. A partir de agora seus clientes receberão lembretes, confirmações e o fechamento do mês por aqui.`;
}

export function templateOtp(petshopNome: string, codigo: string): string {
  return `Seu código para agendar em *${petshopNome}* é *${codigo}*.\n\nEle vale por 5 minutos. Se você não pediu esse código, ignore esta mensagem.`;
}

/** Linha de rodapé dos botões: funciona mesmo se o celular esconder os botões. */
export const RODAPE_BOTOES = "Ou responda 1 para confirmar, 2 para cancelar.";

export function templateConfirmacao(args: {
  petshopNome: string;
  tutorNome: string;
  petNome: string;
  servicoNome: string;
  inicioISO: string;
  valorCentavos: number;
  planoNome?: string | null;
}): string {
  const { data, hora, diaSemana } = dataHora(args.inicioISO);
  const valor = args.planoNome
    ? `Coberto pelo plano *${args.planoNome}* — sem custo.`
    : `Valor: *${formatCentavos(args.valorCentavos)}*.`;
  return `Oi, ${primeiroNome(args.tutorNome)}! 🐾\n\nAgendamento em *${args.petshopNome}*:\n\n• Pet: *${args.petNome}*\n• Serviço: ${args.servicoNome}\n• ${diaSemana}, ${data} às *${hora}*\n\n${valor}\n\nPode confirmar se vem?`;
}

export function templateLembrete(args: {
  petshopNome: string;
  tutorNome: string;
  petNome: string;
  servicoNome: string;
  inicioISO: string;
}): string {
  const { data, hora, diaSemana } = dataHora(args.inicioISO);
  return `Oi, ${primeiroNome(args.tutorNome)}! 🐾\n\nLembrete de *${args.petshopNome}*: o *${args.petNome}* tem *${args.servicoNome}* ${diaSemana}, ${data} às *${hora}*.\n\nPode confirmar se vem?`;
}

export function templateRespostaConfirmado(petNome: string, inicioISO: string): string {
  const { data, hora } = dataHora(inicioISO);
  return `Confirmado! ✅ Esperamos o *${petNome}* dia ${data} às ${hora}. Até lá! 🐾`;
}

export function templateRespostaCancelado(petNome: string, inicioISO: string, linkAgendar?: string): string {
  const { data, hora } = dataHora(inicioISO);
  const remarcar = linkAgendar ? `\n\nPra marcar outro horário: ${linkAgendar}` : "\n\nSe quiser remarcar, é só responder por aqui.";
  return `Tudo bem, cancelamos o horário do *${petNome}* de ${data} às ${hora}.${remarcar}`;
}

/**
 * Mensagem do fechamento no formato que o petshop já usa ("Segue fechamento /
 * Banhos 04/08 25/08 01/09 / Foram 3 banhos / Total 120,00"), com o nome do
 * pet, o valor de cada banho e a chave PIX.
 */
export function templateFechamento(args: {
  petshopNome: string;
  tutorNome: string;
  resumo: ResumoFechamento;
  chavePix: string | null;
}): string {
  const { resumo } = args;
  const grupos = resumo.pets.flatMap((p) => p.servicos.map((s) => ({ pet: p.petNome, s })));
  const tudoBanho = grupos.every(({ s }) => s.nome.toLowerCase().includes("banho"));
  const palavra = (n: number) =>
    tudoBanho ? `banho${n === 1 ? "" : "s"}` : `atendimento${n === 1 ? "" : "s"}`;
  const variosGrupos = grupos.length > 1;

  const linhas: string[] = [];
  for (const { pet, s } of grupos) {
    linhas.push(`*${pet}* — ${s.nome}`);
    for (const d of s.datas) {
      linhas.push(`• ${d.data} (${d.diaSemana})${d.coberto ? " — incluso no plano" : ""}`);
    }
    const avulsos = s.quantidade - s.cobertos;
    // Com mais de um pet/serviço, cada bloco mostra o próprio subtotal.
    if (variosGrupos && avulsos > 0) {
      linhas.push(
        s.valorUnitarioCentavos != null
          ? `${avulsos} × ${formatCentavos(s.valorUnitarioCentavos)} = ${formatCentavos(s.subtotalCentavos)}`
          : `Subtotal: ${formatCentavos(s.subtotalCentavos)}`
      );
    }
    linhas.push("");
  }
  for (const p of resumo.pets) {
    for (const m of p.mensalidades) {
      linhas.push(`*${p.petNome}* — ${m.descricao}: ${formatCentavos(m.valorCentavos)}`);
    }
  }

  let foram = "";
  if (resumo.totalBanhos > 0) {
    const unico = !variosGrupos ? grupos[0]?.s : undefined;
    let detalhe = "";
    if (unico && unico.valorUnitarioCentavos != null) {
      const avulsos = unico.quantidade - unico.cobertos;
      detalhe =
        unico.cobertos === 0
          ? ` · ${formatCentavos(unico.valorUnitarioCentavos)} cada`
          : ` — ${avulsos} × ${formatCentavos(unico.valorUnitarioCentavos)} e ${unico.cobertos} ${unico.cobertos === 1 ? "incluído" : "incluídos"} no plano`;
    }
    foram = `Foram ${resumo.totalBanhos} ${palavra(resumo.totalBanhos)}${detalhe}\n`;
  }
  const pix = args.chavePix ? `\n💳 Pix: ${args.chavePix}\n` : "";

  return `${saudacao()}, ${primeiroNome(args.tutorNome)}! 🐾\n\nSegue o fechamento de *${args.petshopNome}*:\n\n${linhas.join("\n").trim()}\n\n${foram}*Total: ${formatCentavos(resumo.totalCentavos)}*\n${pix}\nO extrato em PDF vai logo abaixo. Obrigado pela confiança! 💚`;
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
