import { DateTime } from "luxon";
import { formatCentavos } from "@/lib/currency";

const ZONE = "America/Sao_Paulo";

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
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
  return `Oi, ${primeiroNome(args.tutorNome)}! 🐾\n\nAgendamento confirmado em *${args.petshopNome}*:\n\n• Pet: *${args.petNome}*\n• Serviço: ${args.servicoNome}\n• ${diaSemana}, ${data} às *${hora}*\n\n${valor}\n\nQualquer imprevisto, é só responder por aqui.`;
}

export function templateLembrete(args: {
  petshopNome: string;
  tutorNome: string;
  petNome: string;
  servicoNome: string;
  inicioISO: string;
}): string {
  const { data, hora, diaSemana } = dataHora(args.inicioISO);
  return `Oi, ${primeiroNome(args.tutorNome)}! 🐾\n\nLembrete de *${args.petshopNome}*: o *${args.petNome}* tem *${args.servicoNome}* ${diaSemana}, ${data} às *${hora}*.\n\nPode confirmar por aqui? Se precisar remarcar, é só avisar.`;
}

export function templateFechamento(args: {
  petshopNome: string;
  tutorNome: string;
  competencia: string; // yyyy-MM-dd
  totalCentavos: number;
  chavePix: string | null;
}): string {
  const mes = DateTime.fromISO(args.competencia).setLocale("pt-BR").toFormat("LLLL 'de' yyyy");
  const pix = args.chavePix
    ? `\n\nPagamento via PIX: *${args.chavePix}*`
    : "";
  return `Oi, ${primeiroNome(args.tutorNome)}! 🐾\n\nSegue o extrato de *${mes}* de *${args.petshopNome}*.\n\nTotal: *${formatCentavos(args.totalCentavos)}*${pix}\n\nObrigado por cuidar do seu pet com a gente! 💚`;
}

export function templateRelatorio(args: {
  petshopNome: string;
  competencia: string;
  faturamentoCentavos: number;
  atendimentos: number;
  planosAtivos: number;
}): string {
  const mes = DateTime.fromISO(args.competencia).setLocale("pt-BR").toFormat("LLLL 'de' yyyy");
  return `📊 *Relatório de ${mes}* — ${args.petshopNome}\n\n• Faturamento: *${formatCentavos(args.faturamentoCentavos)}*\n• Atendimentos concluídos: *${args.atendimentos}*\n• Planos ativos: *${args.planosAtivos}*\n\nO PDF completo segue em anexo.`;
}
