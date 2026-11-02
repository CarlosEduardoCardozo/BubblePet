"use server";

import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { formatPhoneBR, normalizePhoneBR } from "@/lib/phone";
import {
  MAX_SERVICOS,
  lerPreco,
  mensagemBoasVindas,
  mensagemParaPetshop,
  type ServicoGratis,
} from "./comum";
import {
  atualizarLinkGratis,
  criarLinkGratis,
  diaPermitido,
  enviarPelaPlataforma,
  ipDaRequisicao,
  limitePedido,
  linkPorToken,
  linkPublicoPorSlug,
  marcarAviso,
  registrarPedido,
  rotuloDia,
} from "./servidor";

/** Lê os pares servico_nome/servico_preco do formulário, sem repetidos. */
function servicosDoForm(formData: FormData): ServicoGratis[] {
  const nomes = formData.getAll("servico_nome").map((v) => String(v).trim().slice(0, 80));
  const precos = formData.getAll("servico_preco").map((v) => String(v));
  const vistos = new Set<string>();
  const lista: ServicoGratis[] = [];
  nomes.forEach((nome, i) => {
    const chave = nome.toLowerCase();
    if (!nome || vistos.has(chave)) return;
    vistos.add(chave);
    lista.push({ nome, preco_centavos: lerPreco(precos[i] ?? "") });
  });
  return lista.slice(0, MAX_SERVICOS);
}

/* ───────── Criar o link (landing) ───────── */

const criarSchema = z.object({
  nomePetshop: z.string().trim().min(2, "Informe o nome do petshop").max(80),
  nomeDono: z.string().trim().min(2, "Informe seu nome").max(80),
  whatsapp: z.string().trim().min(8, "Informe seu WhatsApp"),
});

export type CriarLinkState =
  | { ok: true; linkPublico: string; linkGestao: string; nomePetshop: string; avisoEnviado: boolean }
  | { ok: false; erro: string }
  | undefined;

export async function criarLinkAction(_prev: CriarLinkState, formData: FormData): Promise<CriarLinkState> {
  if (String(formData.get("site") ?? "").trim()) return { ok: false, erro: "Não foi possível criar o link." };
  if (formData.get("aceite") !== "on") {
    return { ok: false, erro: "Marque que aceita receber os pedidos pelo WhatsApp." };
  }

  const parsed = criarSchema.safeParse({
    nomePetshop: formData.get("nomePetshop"),
    nomeDono: formData.get("nomeDono"),
    whatsapp: formData.get("whatsapp"),
  });
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const whatsapp = normalizePhoneBR(parsed.data.whatsapp);
  if (!whatsapp) return { ok: false, erro: "WhatsApp inválido. Use DDD + número." };

  const servicos = servicosDoForm(formData);
  if (servicos.length === 0) return { ok: false, erro: "Adicione pelo menos um serviço." };

  const r = await criarLinkGratis({
    nomePetshop: parsed.data.nomePetshop,
    nomeDono: parsed.data.nomeDono,
    whatsapp,
    servicos,
  });
  if (!r.ok) return { ok: false, erro: r.erro };

  const base = await appUrl();
  const linkPublico = `${base}/agendar/${r.link.slug}`;
  const linkGestao = `${base}/meu-link/${r.token}`;

  // Manda os dois links pro WhatsApp de quem criou: é ali que os pedidos vão
  // chegar, e é o jeito de recuperar a página de gestão depois.
  const aviso = await enviarPelaPlataforma(
    whatsapp,
    mensagemBoasVindas({ nomeDono: parsed.data.nomeDono.split(" ")[0], linkPublico, linkGestao })
  );

  return {
    ok: true,
    linkPublico,
    linkGestao,
    nomePetshop: r.link.nomePetshop,
    avisoEnviado: aviso.status === "enviado",
  };
}

/* ───────── Pedido do tutor (/agendar/<slug>) ───────── */

const pedidoSchema = z.object({
  tutorNome: z.string().trim().min(2, "Informe seu nome").max(80),
  telefone: z.string().trim().min(8, "Informe seu WhatsApp"),
  petNome: z.string().trim().min(1, "Informe o nome do pet").max(60),
  servico: z.string().trim().min(1, "Escolha um serviço").max(80),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha o dia"),
  turno: z.enum(["manha", "tarde"], { message: "Escolha o turno" }),
  observacao: z.string().trim().max(300).optional(),
});

export type PedidoState =
  | {
      ok: true;
      dados: {
        tutorNome: string;
        tutorTelefone: string;
        petNome: string;
        servico: string;
        diaRotulo: string;
        turno: "manha" | "tarde";
        observacao: string | null;
      };
    }
  | { ok: false; erro: string }
  | undefined;

export async function pedirAction(slug: string, _prev: PedidoState, formData: FormData): Promise<PedidoState> {
  if (String(formData.get("site") ?? "").trim()) return { ok: false, erro: "Não foi possível enviar o pedido." };

  const link = await linkPublicoPorSlug(slug);
  if (!link) return { ok: false, erro: "Este link de agendamento não está mais disponível." };

  const parsed = pedidoSchema.safeParse({
    tutorNome: formData.get("tutorNome"),
    telefone: formData.get("telefone"),
    petNome: formData.get("petNome"),
    servico: formData.get("servico"),
    dia: formData.get("dia"),
    turno: formData.get("turno"),
    observacao: formData.get("observacao") || undefined,
  });
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const telefone = normalizePhoneBR(d.telefone);
  if (!telefone) return { ok: false, erro: "WhatsApp inválido. Use DDD + número." };
  if (!link.servicos.some((s) => s.nome === d.servico)) return { ok: false, erro: "Escolha um serviço da lista." };
  if (!diaPermitido(d.dia)) return { ok: false, erro: "Escolha um dia da lista." };

  const ip = await ipDaRequisicao();
  const bloqueio = await limitePedido(link.id, telefone, ip);
  if (bloqueio) return { ok: false, erro: bloqueio };

  const observacao = d.observacao || null;
  const pedidoId = await registrarPedido({
    linkId: link.id,
    tutorNome: d.tutorNome,
    tutorTelefone: telefone,
    petNome: d.petNome,
    servico: d.servico,
    dia: d.dia,
    turno: d.turno,
    observacao,
    ip,
  });
  if (!pedidoId) return { ok: false, erro: "Não foi possível enviar o pedido. Tente de novo." };

  const dados = {
    tutorNome: d.tutorNome,
    tutorTelefone: telefone,
    petNome: d.petNome,
    servico: d.servico,
    diaRotulo: rotuloDia(d.dia),
    turno: d.turno,
    observacao,
  };

  // O BubblePet sempre avisa o petshop. O link da página de pedidos não vai
  // junto: só guardamos o hash do token, e ele já foi na mensagem de boas-vindas.
  const aviso = await enviarPelaPlataforma(
    link.whatsapp,
    mensagemParaPetshop({ ...dados, telefoneFormatado: formatPhoneBR(telefone) })
  );
  await marcarAviso(pedidoId, aviso);

  return { ok: true, dados };
}

/* ───────── Editar o link (/meu-link/<token>) ───────── */

export type SalvarLinkState = { ok: true } | { ok: false; erro: string } | undefined;

export async function salvarLinkAction(token: string, _prev: SalvarLinkState, formData: FormData): Promise<SalvarLinkState> {
  const link = await linkPorToken(token);
  if (!link || link.petshopId) return { ok: false, erro: "Link não encontrado." };

  const nomePetshop = String(formData.get("nomePetshop") ?? "").trim();
  if (nomePetshop.length < 2 || nomePetshop.length > 80) return { ok: false, erro: "Informe o nome do petshop." };
  const endereco = String(formData.get("endereco") ?? "").trim().slice(0, 160) || null;
  const servicos = servicosDoForm(formData);
  if (servicos.length === 0) return { ok: false, erro: "Deixe pelo menos um serviço." };

  const ok = await atualizarLinkGratis(link.id, { nomePetshop, servicos, endereco });
  return ok ? { ok: true } : { ok: false, erro: "Não foi possível salvar. Tente de novo." };
}
