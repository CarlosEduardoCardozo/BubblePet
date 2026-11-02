import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, UazapiError } from "@/lib/uazapi";
import { slugify, slugValido } from "@/lib/slug";
import { DIAS_A_FRENTE, type ServicoGratis } from "./comum";

const ZONE = "America/Sao_Paulo";
const MIN = 60_000;

// Limites. O risco real é usar o WhatsApp da plataforma pra mandar mensagem a
// estranhos (e o número ser bloqueado), então tudo que dispara mensagem tem teto.
const LINKS_POR_IP_HORA = 5;
const LINKS_POR_WHATSAPP_DIA = 3;
const PEDIDOS_POR_IP_HORA = 10;
const PEDIDOS_POR_TELEFONE_HORA = 5;
const PEDIDOS_POR_LINK_HORA = 40;

export type LinkGratis = {
  id: string;
  slug: string;
  nomePetshop: string;
  nomeDono: string;
  whatsapp: string;
  servicos: ServicoGratis[];
  endereco: string | null;
  petshopId: string | null;
  criadoEm: string;
};

type Linha = {
  id: string;
  slug: string;
  nome_petshop: string;
  nome_dono: string;
  whatsapp: string;
  servicos: unknown;
  endereco: string | null;
  petshop_id: string | null;
  criado_em: string;
};

const COLUNAS = "id, slug, nome_petshop, nome_dono, whatsapp, servicos, endereco, petshop_id, criado_em";

export function lerServicos(raw: unknown): ServicoGratis[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is { nome: unknown; preco_centavos: unknown } => !!s && typeof s === "object")
    .map((s) => ({
      nome: String(s.nome ?? "").trim().slice(0, 80),
      preco_centavos: typeof s.preco_centavos === "number" && s.preco_centavos > 0 ? Math.round(s.preco_centavos) : null,
    }))
    .filter((s) => s.nome.length > 0);
}

function deLinha(l: Linha): LinkGratis {
  return {
    id: l.id,
    slug: l.slug,
    nomePetshop: l.nome_petshop,
    nomeDono: l.nome_dono,
    whatsapp: l.whatsapp,
    servicos: lerServicos(l.servicos),
    endereco: l.endereco,
    petshopId: l.petshop_id,
    criadoEm: l.criado_em,
  };
}

export async function ipDaRequisicao(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Livre nos dois lugares que usam /agendar/<slug>: petshops e links grátis. */
export async function slugLivre(nome: string): Promise<string> {
  const db = createAdminClient();
  let base = slugify(nome);
  if (!slugValido(base)) base = "petshop";
  for (let i = 1; i <= 20; i++) {
    const candidato = i === 1 ? base : `${base.slice(0, 36)}-${i}`;
    const [{ data: petshop }, { data: link }] = await Promise.all([
      db.from("petshops").select("id").eq("slug", candidato).maybeSingle(),
      db.from("links_gratis").select("id").eq("slug", candidato).maybeSingle(),
    ]);
    if (!petshop && !link) return candidato;
  }
  return `${base.slice(0, 30)}-${randomBytes(3).toString("hex")}`;
}

/** Link ainda no plano grátis (sem conta completa) — é o que a página pública mostra. */
export async function linkPublicoPorSlug(slug: string): Promise<LinkGratis | null> {
  const { data } = await createAdminClient()
    .from("links_gratis")
    .select(COLUNAS)
    .eq("slug", slug)
    .is("petshop_id", null)
    .maybeSingle();
  return data ? deLinha(data as Linha) : null;
}

export async function linkPorToken(token: string): Promise<LinkGratis | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("links_gratis")
    .select(COLUNAS)
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  return data ? deLinha(data as Linha) : null;
}

export type ResultadoCriar =
  | { ok: true; link: LinkGratis; token: string }
  | { ok: false; erro: string };

export async function criarLinkGratis(dados: {
  nomePetshop: string;
  nomeDono: string;
  whatsapp: string;
  servicos: ServicoGratis[];
}): Promise<ResultadoCriar> {
  const db = createAdminClient();
  const ip = await ipDaRequisicao();
  const desde = (ms: number) => new Date(Date.now() - ms).toISOString();

  const { count: doNumero } = await db
    .from("links_gratis")
    .select("id", { count: "exact", head: true })
    .eq("whatsapp", dados.whatsapp)
    .gte("criado_em", desde(24 * 60 * MIN));
  if ((doNumero ?? 0) >= LINKS_POR_WHATSAPP_DIA) {
    return { ok: false, erro: "Esse WhatsApp já criou links demais hoje. Confira a mensagem que enviamos pra ele." };
  }
  if (ip) {
    const { count: doIp } = await db
      .from("links_gratis")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("criado_em", desde(60 * MIN));
    if ((doIp ?? 0) >= LINKS_POR_IP_HORA) {
      return { ok: false, erro: "Muitos links criados deste aparelho. Tente de novo mais tarde." };
    }
  }

  const token = randomBytes(24).toString("base64url");
  // Duas pessoas podem pegar o mesmo slug ao mesmo tempo: tenta de novo.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const slug = await slugLivre(dados.nomePetshop);
    const { data, error } = await db
      .from("links_gratis")
      .insert({
        slug,
        nome_petshop: dados.nomePetshop,
        nome_dono: dados.nomeDono,
        whatsapp: dados.whatsapp,
        servicos: dados.servicos,
        token_hash: hashToken(token),
        ip,
      })
      .select(COLUNAS)
      .single();
    if (data) return { ok: true, link: deLinha(data as Linha), token };
    if (error?.code !== "23505") break;
  }
  return { ok: false, erro: "Não foi possível criar o link agora. Tente de novo." };
}

export async function atualizarLinkGratis(
  id: string,
  dados: { nomePetshop: string; servicos: ServicoGratis[]; endereco: string | null }
): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("links_gratis")
    .update({
      nome_petshop: dados.nomePetshop,
      servicos: dados.servicos,
      endereco: dados.endereco,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .is("petshop_id", null);
  return !error;
}

/* ───────── Dias ───────── */

export type DiaOpcao = { iso: string; rotulo: string; curto: string; semana: string };

/** Hoje e os próximos dias, no horário de São Paulo. */
export function proximosDias(): DiaOpcao[] {
  const hoje = DateTime.now().setZone(ZONE).setLocale("pt-BR").startOf("day");
  return Array.from({ length: DIAS_A_FRENTE }, (_, i) => {
    const d = hoje.plus({ days: i });
    return {
      iso: d.toISODate()!,
      rotulo: rotuloDia(d.toISODate()!),
      curto: d.toFormat("dd/LL"),
      semana: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : d.toFormat("ccc").replace(".", ""),
    };
  });
}

/** "2026-11-14" → "sexta, 14/11" */
export function rotuloDia(iso: string): string {
  const d = DateTime.fromISO(iso, { zone: ZONE }).setLocale("pt-BR");
  return `${d.toFormat("cccc").replace("-feira", "")}, ${d.toFormat("dd/LL")}`;
}

export function diaPermitido(iso: string): boolean {
  return proximosDias().some((d) => d.iso === iso);
}

/* ───────── Pedidos ───────── */

export type Pedido = {
  id: string;
  tutorNome: string;
  tutorTelefone: string;
  petNome: string;
  servico: string;
  dia: string;
  turno: "manha" | "tarde";
  observacao: string | null;
  avisoStatus: "enviado" | "erro" | "ignorado";
  criadoEm: string;
};

/** Confere os limites antes de gravar. null = pode seguir. */
export async function limitePedido(linkId: string, telefone: string, ip: string | null): Promise<string | null> {
  const db = createAdminClient();
  const desde = new Date(Date.now() - 60 * MIN).toISOString();
  const contar = (col: string, valor: string) =>
    db
      .from("pedidos_link_gratis")
      .select("id", { count: "exact", head: true })
      .eq(col, valor)
      .gte("criado_em", desde)
      .then(({ count }) => count ?? 0);

  const [porTelefone, porLink, porIp] = await Promise.all([
    contar("tutor_telefone", telefone),
    contar("link_id", linkId),
    ip ? contar("ip", ip) : Promise.resolve(0),
  ]);
  if (porTelefone >= PEDIDOS_POR_TELEFONE_HORA || porIp >= PEDIDOS_POR_IP_HORA) {
    return "Você já fez vários pedidos agora há pouco. Aguarde o petshop responder.";
  }
  if (porLink >= PEDIDOS_POR_LINK_HORA) {
    return "Este petshop recebeu muitos pedidos agora. Tente de novo daqui a pouco ou chame no WhatsApp.";
  }
  return null;
}

export async function registrarPedido(p: {
  linkId: string;
  tutorNome: string;
  tutorTelefone: string;
  petNome: string;
  servico: string;
  dia: string;
  turno: "manha" | "tarde";
  observacao: string | null;
  ip: string | null;
}): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("pedidos_link_gratis")
    .insert({
      link_id: p.linkId,
      tutor_nome: p.tutorNome,
      tutor_telefone: p.tutorTelefone,
      pet_nome: p.petNome,
      servico: p.servico,
      dia: p.dia,
      turno: p.turno,
      observacao: p.observacao,
      ip: p.ip,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

export async function marcarAviso(pedidoId: string, r: ResultadoPlataforma): Promise<void> {
  await createAdminClient()
    .from("pedidos_link_gratis")
    .update({ aviso_status: r.status, aviso_erro: r.status === "erro" ? r.erro : null })
    .eq("id", pedidoId);
}

export async function pedidosDoLink(linkId: string): Promise<Pedido[]> {
  const { data } = await createAdminClient()
    .from("pedidos_link_gratis")
    .select("id, tutor_nome, tutor_telefone, pet_nome, servico, dia, turno, observacao, aviso_status, criado_em")
    .eq("link_id", linkId)
    .order("criado_em", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => ({
    id: r.id,
    tutorNome: r.tutor_nome,
    tutorTelefone: r.tutor_telefone,
    petNome: r.pet_nome,
    servico: r.servico,
    dia: r.dia,
    turno: r.turno,
    observacao: r.observacao,
    avisoStatus: r.aviso_status,
    criadoEm: r.criado_em,
  }));
}

/* ───────── WhatsApp da plataforma ───────── */

export type ResultadoPlataforma = { status: "enviado" } | { status: "ignorado" } | { status: "erro"; erro: string };

/**
 * Envia pelo número do próprio BubblePet (instância da UAZAPI cujo token fica
 * em BUBBLEPET_WHATSAPP_TOKEN). Sem o token configurado, não envia e devolve
 * "ignorado" — o pedido continua salvo na página de gestão. Nunca lança.
 */
export async function enviarPelaPlataforma(numeroE164: string, texto: string): Promise<ResultadoPlataforma> {
  const token = process.env.BUBBLEPET_WHATSAPP_TOKEN;
  if (!token || !process.env.UAZAPI_BASE_URL) return { status: "ignorado" };
  try {
    await enviarTexto(token, numeroE164, texto);
    return { status: "enviado" };
  } catch (error) {
    const erro =
      error instanceof UazapiError ? `UAZAPI ${error.status}` : error instanceof Error ? error.message : "erro";
    console.error("[link-gratis] envio pela plataforma falhou:", erro);
    return { status: "erro", erro: erro.slice(0, 200) };
  }
}
