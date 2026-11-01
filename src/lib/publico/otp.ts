import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const VALIDADE_MIN = 5;
const MAX_TENTATIVAS = 5;

// Limites do envio de código. Folgados pra quem usa de verdade (um cliente
// pede 1 ou 2 códigos, uma vez a cada 180 dias) e fechados pra quem abusa:
// o risco real é gastar o WhatsApp do petshop mandando mensagem pra estranhos.
const MAX_POR_TELEFONE_15MIN = 3;
const MAX_POR_TELEFONE_DIA = 8;
const MAX_POR_IP_HORA = 20;
/** Um aparelho testando muitos números diferentes é varredura, não cliente. */
const MAX_TELEFONES_POR_IP_HORA = 8;
/** Teto do petshop inteiro: protege o número de WhatsApp contra bloqueio. */
const MAX_POR_PETSHOP_HORA = 60;

const MIN = 60_000;

function hash(petshopId: string, telefone: string, codigo: string): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) throw new Error("OTP_SECRET não configurado.");
  return createHmac("sha256", secret)
    .update(`${petshopId}|${telefone}|${codigo}`)
    .digest("hex");
}

export type LimiteOtp = "telefone" | "ip" | "petshop";
export type EmitirResultado = { codigo: string } | { limite: LimiteOtp };

/**
 * Gera um código de 6 dígitos, invalida os anteriores e grava só o HMAC.
 * Rate limit contado na própria tabela — sem Redis.
 */
export async function emitirOtp(params: {
  petshopId: string;
  telefone: string;
  ip: string | null;
}): Promise<EmitirResultado> {
  const admin = createAdminClient();
  const agora = new Date();
  const desde = (ms: number) => new Date(agora.getTime() - ms).toISOString();

  // Por celular: poucos em 15 minutos e um teto no dia.
  const { data: doTelefone } = await admin
    .from("otp_codigos")
    .select("criado_em")
    .eq("petshop_id", params.petshopId)
    .eq("telefone", params.telefone)
    .gte("criado_em", desde(24 * 60 * MIN));
  const recentes = (doTelefone ?? []).filter((o) => o.criado_em >= desde(15 * MIN)).length;
  if (recentes >= MAX_POR_TELEFONE_15MIN || (doTelefone ?? []).length >= MAX_POR_TELEFONE_DIA) {
    return { limite: "telefone" };
  }

  // Por aparelho (IP): total de códigos e quantidade de números diferentes.
  if (params.ip) {
    const { data: doIp } = await admin
      .from("otp_codigos")
      .select("telefone")
      .eq("ip", params.ip)
      .gte("criado_em", desde(60 * MIN));
    const linhas = doIp ?? [];
    const distintos = new Set(linhas.map((o) => o.telefone));
    distintos.add(params.telefone);
    if (linhas.length >= MAX_POR_IP_HORA || distintos.size > MAX_TELEFONES_POR_IP_HORA) {
      return { limite: "ip" };
    }
  }

  // Por petshop: teto geral de códigos por hora.
  const { count: doPetshop } = await admin
    .from("otp_codigos")
    .select("id", { count: "exact", head: true })
    .eq("petshop_id", params.petshopId)
    .gte("criado_em", desde(60 * MIN));
  if ((doPetshop ?? 0) >= MAX_POR_PETSHOP_HORA) return { limite: "petshop" };

  await admin
    .from("otp_codigos")
    .update({ consumido_em: agora.toISOString() })
    .eq("petshop_id", params.petshopId)
    .eq("telefone", params.telefone)
    .is("consumido_em", null);

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await admin.from("otp_codigos").insert({
    petshop_id: params.petshopId,
    telefone: params.telefone,
    codigo_hash: hash(params.petshopId, params.telefone, codigo),
    expira_em: new Date(agora.getTime() + VALIDADE_MIN * 60_000).toISOString(),
    ip: params.ip,
  });
  if (error) throw error;

  return { codigo };
}

export type VerificarResultado = "ok" | "invalido" | "expirado" | "bloqueado";

export async function verificarOtp(params: {
  petshopId: string;
  telefone: string;
  codigo: string;
}): Promise<VerificarResultado> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("otp_codigos")
    .select("id, codigo_hash, expira_em, tentativas")
    .eq("petshop_id", params.petshopId)
    .eq("telefone", params.telefone)
    .is("consumido_em", null)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return "expirado";
  if (new Date(row.expira_em) < new Date()) return "expirado";
  if (row.tentativas >= MAX_TENTATIVAS) return "bloqueado";

  const esperado = Buffer.from(row.codigo_hash, "hex");
  const recebido = Buffer.from(hash(params.petshopId, params.telefone, params.codigo), "hex");
  const bate = esperado.length === recebido.length && timingSafeEqual(esperado, recebido);

  if (!bate) {
    await admin
      .from("otp_codigos")
      .update({ tentativas: row.tentativas + 1 })
      .eq("id", row.id);
    return row.tentativas + 1 >= MAX_TENTATIVAS ? "bloqueado" : "invalido";
  }

  await admin
    .from("otp_codigos")
    .update({ consumido_em: new Date().toISOString() })
    .eq("id", row.id);
  return "ok";
}
