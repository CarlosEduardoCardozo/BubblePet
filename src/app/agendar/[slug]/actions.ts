"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { normalizePhoneBR } from "@/lib/phone";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp";
import { templateOtp } from "@/lib/whatsapp-templates";
import { notificarAgendamento } from "@/lib/agenda/notificar";
import { calcularHorariosLivres } from "@/lib/agenda/slots";
import { emitirOtp, verificarOtp } from "@/lib/publico/otp";
import {
  criarSessaoCadastro,
  criarSessaoTutor,
  encerrarSessaoCadastro,
  encerrarSessaoTutor,
  getSessaoCadastro,
  getSessaoTutor,
} from "@/lib/publico/session";
import {
  agendarPublico,
  criarPetPublico,
  cadastrosRecentesDemais,
  criarTutorPublico,
  ocupadosNoDia,
  petshopPorSlug,
  tutorPorTelefone,
  type DadosPetNovo,
  type ResultadoAgendar,
} from "@/lib/publico/dal";

type Resultado = { ok: true } | { ok: false; erro: string };

const MENSAGEM_LIMITE = {
  telefone: "Você já pediu vários códigos. Use o último que chegou no WhatsApp ou tente de novo em alguns minutos.",
  ip: "Muitas tentativas deste aparelho. Tente de novo mais tarde ou fale com o petshop.",
  petshop: "O envio de códigos está ocupado agora. Tente de novo em alguns minutos ou fale com o petshop.",
} as const;

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

  // Quem ainda não é cliente também recebe o código: é ele que prova que o
  // celular é da pessoa antes do cadastro. A resposta é igual nos dois casos.
  const tutor = await tutorPorTelefone(petshop.id, telefone);

  const emitido = await emitirOtp({ petshopId: petshop.id, telefone, ip: await ipDoCliente() });
  if ("limite" in emitido) {
    console.warn(`[link-publico] limite de código (${emitido.limite}) em ${slug}`);
    return { ok: false, erro: MENSAGEM_LIMITE[emitido.limite] };
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
    tutorId: tutor?.id,
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
): Promise<Resultado | { ok: true; novo: true }> {
  const petshop = await petshopPorSlug(slug);
  if (!petshop) return { ok: false, erro: "Petshop não encontrado." };

  const telefone = normalizePhoneBR(telefoneRaw);
  const limpo = codigo.replace(/\D/g, "");
  if (!telefone || limpo.length !== 6) return { ok: false, erro: "Digite os 6 dígitos do código." };

  const resultado = await verificarOtp({ petshopId: petshop.id, telefone, codigo: limpo });
  if (resultado === "ok") {
    const tutor = await tutorPorTelefone(petshop.id, telefone);
    if (tutor) {
      await criarSessaoTutor({ tutorId: tutor.id, petshopId: petshop.id, slug });
      return { ok: true };
    }
    // Celular confirmado, mas sem cadastro: segue para o cadastro do tutor e do pet.
    await criarSessaoCadastro({ telefone, petshopId: petshop.id, slug });
    return { ok: true, novo: true };
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

export async function sairSessao(slug: string): Promise<void> {
  await encerrarSessaoTutor(slug);
}

const ESPECIES = ["cachorro", "gato", "outro"] as const;
const PORTES = ["pequeno", "medio", "grande"] as const;

function lerPet(dados: { petNome: string; especie: string; porte: string; raca: string }): DadosPetNovo | string {
  const nome = dados.petNome.trim();
  if (nome.length < 1 || nome.length > 60) return "Digite o nome do pet.";
  if (!ESPECIES.includes(dados.especie as (typeof ESPECIES)[number])) return "Escolha se é cachorro, gato ou outro.";
  const porte = PORTES.includes(dados.porte as (typeof PORTES)[number]) ? (dados.porte as (typeof PORTES)[number]) : null;
  // O porte define o preço: cachorro e gato precisam dele.
  if (!porte) return "Escolha o porte do pet.";
  const raca = dados.raca.trim().slice(0, 60);
  return { nome, especie: dados.especie as DadosPetNovo["especie"], porte, raca: raca || null };
}

/** Cliente novo: cria o tutor e o primeiro pet e já deixa a pessoa logada. */
export async function cadastrarTutorEPet(
  slug: string,
  dados: { nome: string; petNome: string; especie: string; porte: string; raca: string }
): Promise<Resultado> {
  const petshop = await petshopPorSlug(slug);
  const cadastro = await getSessaoCadastro(slug);
  if (!petshop || !cadastro || cadastro.petshopId !== petshop.id) {
    return { ok: false, erro: "Confirme o celular de novo para continuar." };
  }

  const nome = dados.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 80) return { ok: false, erro: "Digite seu nome." };
  const pet = lerPet(dados);
  if (typeof pet === "string") return { ok: false, erro: pet };

  if (await cadastrosRecentesDemais(petshop.id)) {
    console.warn(`[link-publico] limite de cadastros novos em ${slug}`);
    return { ok: false, erro: "Estamos recebendo muitos cadastros agora. Tente de novo mais tarde ou fale com o petshop." };
  }

  const criado = await criarTutorPublico({ petshopId: petshop.id, telefone: cadastro.telefone, nome, pet });
  if (!criado.ok) return criado;

  await encerrarSessaoCadastro(slug);
  await criarSessaoTutor({ tutorId: criado.tutorId, petshopId: petshop.id, slug });
  revalidatePath("/tutores-pets");
  return { ok: true };
}

/** Cliente já cadastrado inclui mais um pet pelo link. */
export async function cadastrarPet(
  slug: string,
  dados: { petNome: string; especie: string; porte: string; raca: string }
): Promise<Resultado & { petId?: string }> {
  const sessao = await getSessaoTutor(slug);
  const petshop = await petshopPorSlug(slug);
  if (!sessao || !petshop || sessao.petshopId !== petshop.id) {
    return { ok: false, erro: "Sua sessão expirou. Confirme o celular de novo." };
  }
  const pet = lerPet(dados);
  if (typeof pet === "string") return { ok: false, erro: pet };

  const criado = await criarPetPublico(petshop.id, sessao.tutorId, pet);
  if (!criado.ok) return criado;
  revalidatePath("/tutores-pets");
  return { ok: true, petId: criado.petId };
}

export async function cancelarCadastro(slug: string): Promise<void> {
  await encerrarSessaoCadastro(slug);
}
