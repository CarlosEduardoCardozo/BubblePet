import "server-only";

import { SignJWT, jwtVerify } from "jose";

// Link de envio pelo celular: quem escaneia o QR não está logado, então o
// próprio link carrega uma permissão curta e restrita a UM atendimento.
const DURACAO_MIN = 30;

export type PermissaoUpload = { agendamentoId: string; petshopId: string };

function segredo(): Uint8Array {
  const raw = process.env.AGENDAR_SESSION_SECRET;
  if (!raw) throw new Error("AGENDAR_SESSION_SECRET não configurado.");
  return new TextEncoder().encode(raw);
}

export async function criarTokenUpload(p: PermissaoUpload): Promise<string> {
  return new SignJWT({ ...p, tipo: "upload" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_MIN}m`)
    .sign(segredo());
}

export async function lerTokenUpload(token: string): Promise<PermissaoUpload | null> {
  try {
    const { payload } = await jwtVerify(token, segredo(), { algorithms: ["HS256"] });
    if (payload.tipo !== "upload") return null;
    if (typeof payload.agendamentoId !== "string" || typeof payload.petshopId !== "string") return null;
    return { agendamentoId: payload.agendamentoId, petshopId: payload.petshopId };
  } catch {
    return null;
  }
}
