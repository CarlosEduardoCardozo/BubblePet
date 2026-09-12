import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const VALIDADE_MIN = 5;
const MAX_TENTATIVAS = 5;
const MAX_POR_TELEFONE_15MIN = 3;
const MAX_POR_IP_HORA = 20;

function hash(petshopId: string, telefone: string, codigo: string): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) throw new Error("OTP_SECRET não configurado.");
  return createHmac("sha256", secret)
    .update(`${petshopId}|${telefone}|${codigo}`)
    .digest("hex");
}

export type EmitirResultado = { codigo: string } | { limite: "telefone" | "ip" };

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

  const { count: porTelefone } = await admin
    .from("otp_codigos")
    .select("id", { count: "exact", head: true })
    .eq("petshop_id", params.petshopId)
    .eq("telefone", params.telefone)
    .gte("criado_em", new Date(agora.getTime() - 15 * 60_000).toISOString());
  if ((porTelefone ?? 0) >= MAX_POR_TELEFONE_15MIN) return { limite: "telefone" };

  if (params.ip) {
    const { count: porIp } = await admin
      .from("otp_codigos")
      .select("id", { count: "exact", head: true })
      .eq("ip", params.ip)
      .gte("criado_em", new Date(agora.getTime() - 60 * 60_000).toISOString());
    if ((porIp ?? 0) >= MAX_POR_IP_HORA) return { limite: "ip" };
  }

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
