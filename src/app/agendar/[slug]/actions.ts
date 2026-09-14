"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { normalizePhoneBR } from "@/lib/phone";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp";
import { templateOtp } from "@/lib/whatsapp-templates";
import { notificarAgendamento } from "@/lib/agenda/notificar";
import { calcularHorariosLivres } from "@/lib/agenda/slots";
import { emitirOtp, verificarOtp } from "@/lib/publico/otp";
import { criarSessaoTutor, encerrarSessaoTutor, getSessaoTutor } from "@/lib/publico/session";
import {
  agendarPublico,
  ocupadosNoDia,
  petshopPorSlug,
  tutorPorTelefone,
  type ResultadoAgendar,
} from "@/lib/publico/dal";

type Resultado = { ok: true } | { ok: false; erro: string };

async function ipDoCliente(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export async function solicitarCodigo(slug: string, telefoneRaw: string): Promise<Resultado> {
  const petshop = await petshopPorSlug(slug);
  if (!petshop) return { ok: false, erro: "Petshop não encontrado." };
  if (!petshop.whatsappConectado) {
    return { ok: false, erro: "O agendamento online está indisponível no momento. Fale direto com o petshop." };
  }

  const telefone = normalizePhoneBR(telefoneRaw);
  if (!telefone) return { ok: false, erro: "Digite o celular com DDD, ex.: (47) 99999-9999." };

  const tutor = await tutorPorTelefone(petshop.id, telefone);
  // Resposta igual exista ou não o cadastro — não revela quem é cliente.
  if (!tutor) return { ok: true };

  const emitido = await emitirOtp({ petshopId: petshop.id, telefone, ip: await ipDoCliente() });
  if ("limite" in emitido) {
    return { ok: false, erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  }
  // Só em desenvolvimento e com opt-in explícito (OTP_DEV_LOG=1): imprime o
  // código no log do servidor em vez de mandar pelo WhatsApp, pra testar o
  // fluxo sem uma instância conectada. Em produção nunca entra aqui.
  if (process.env.NODE_ENV === "development" && process.env.OTP_DEV_LOG === "1") {
    console.log(`[otp-dev] código para ${telefone}: ${emitido.codigo}`);
    return { ok: true };
  }

  const envio = await enviarMensagemWhatsapp({
    petshopId: petshop.id,
    tutorId: tutor.id,
    numeroE164: telefone,
    tipo: "otp",
    texto: templateOtp(petshop.nome, emitido.codigo),
  });
  if (!envio.ok) {
    return { ok: false, erro: "Não conseguimos enviar o código agora. Tente de novo em instantes." };
  }
  return { ok: true };
}

export async function confirmarCodigo(
  slug: string,
  telefoneRaw: string,
  codigo: string
): Promise<Resultado> {
  const petshop = await petshopPorSlug(slug);
  if (!petshop) return { ok: false, erro: "Petshop não encontrado." };

  const telefone = normalizePhoneBR(telefoneRaw);
  const limpo = codigo.replace(/\D/g, "");
  if (!telefone || limpo.length !== 6) return { ok: false, erro: "Digite os 6 dígitos do código." };

  const tutor = await tutorPorTelefone(petshop.id, telefone);
  if (!tutor) return { ok: false, erro: "Código inválido." };

  const resultado = await verificarOtp({ petshopId: petshop.id, telefone, codigo: limpo });
  if (resultado === "ok") {
    await criarSessaoTutor({ tutorId: tutor.id, petshopId: petshop.id, slug });
    return { ok: true };
  }
  if (resultado === "expirado") return { ok: false, erro: "Esse código expirou. Peça um novo." };
  if (resultado === "bloqueado") return { ok: false, erro: "Muitas tentativas erradas. Peça um novo código." };
  return { ok: false, erro: "Código incorreto. Confira a mensagem no WhatsApp." };
}

export async function listarHorarios(
  slug: string,
  servicoId: string,
  dataISO: string,
  duracaoMin: number
): Promise<string[]> {
  const sessao = await getSessaoTutor(slug);
  const petshop = await petshopPorSlug(slug);
  if (!sessao || !petshop || sessao.petshopId !== petshop.id) return [];

  const ocupados = await ocupadosNoDia(petshop.id, dataISO);
  return calcularHorariosLivres({
    dataISO,
    duracaoMin: Math.max(10, Math.min(duracaoMin, 480)),
    ocupados,
    horario: petshop.horario,
  }).map((dt) => dt.toFormat("HH:mm"));
}

export async function confirmarAgendamento(
  slug: string,
  dados: { petId: string; servicoId: string; dataISO: string; hora: string }
): Promise<ResultadoAgendar> {
  const sessao = await getSessaoTutor(slug);
  const petshop = await petshopPorSlug(slug);
  if (!sessao || !petshop || sessao.petshopId !== petshop.id) {
    return { ok: false, erro: "Sua sessão expirou. Confirme o celular de novo." };
  }

  const resultado = await agendarPublico({
    petshopId: petshop.id,
    tutorId: sessao.tutorId,
    petId: dados.petId,
    servicoId: dados.servicoId,
    dataISO: dados.dataISO,
    hora: dados.hora,
    horario: petshop.horario,
  });
  if (!resultado.ok) return resultado;

  // Confirmação por WhatsApp, com os botões Confirmar/Cancelar. Falha aqui
  // não desfaz o agendamento.
  await notificarAgendamento(petshop.id, resultado.agendamentoId, "confirmacao");

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return resultado;
}

export async function sairSessao(): Promise<void> {
  await encerrarSessaoTutor();
}
